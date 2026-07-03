-- Match confirmation + submission flow.
--   home_confirmed / away_confirmed : each team confirms their card
--   submitted                       : home team commits results to stats
-- shooter_stats only aggregates submitted (official) matches afterwards.

alter table public.match
    add column if not exists home_confirmed boolean not null default false,
    add column if not exists away_confirmed boolean not null default false,
    add column if not exists submitted     boolean not null default false;

-- Recreate the per-shooter stats view so only SUBMITTED matches count.
create or replace view public.shooter_stats with (security_invoker = true) as
select
    sh.id            as shooter_id,
    sh.shooter_no,
    sh.name,
    sh.role,
    sh.team_id,
    t.name           as team_name,
    t.slug           as team_slug,
    t.venue          as team_venue,
    count(sc.id)     as matches_played,
    coalesce(max(sc.total), 0)              as best,
    coalesce(sum(sc.tens), 0)               as tens,
    coalesce(round(avg(sc.total), 1), 0)    as average
from public.shooter sh
join public.team  t  on t.id  = sh.team_id
left join public.score sc on sc.shooter_id = sh.id
    and exists (
        select 1 from public.match mm
        where mm.id = sc.match_id and mm.submitted
    )
group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue;

-- A team's captain/generic confirms their own side of a today's match.
create or replace function public.confirm_match_side(p_match uuid, p_side text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    m        public.match%rowtype;
    v_role   text;
    v_team   uuid;
begin
    select role, team_id into v_role, v_team
    from public.user_profile where id = auth.uid();
    if not found then return false; end if;

    select * into m from public.match where id = p_match;
    if not found then return false; end if;
    if m.submitted then return false; end if;

    if v_role = 'admin' then
        null;
    elsif v_role in ('captain', 'generic') and m.match_date = public.league_today() then
        if p_side = 'home' and v_team = m.home_team_id then null;
        elsif p_side = 'away' and v_team = m.away_team_id then null;
        else return false; end if;
    else
        return false;
    end if;

    if p_side = 'home' then
        update public.match set home_confirmed = true where id = p_match;
    elsif p_side = 'away' then
        update public.match set away_confirmed = true where id = p_match;
    else
        return false;
    end if;

    return true;
end;
$$;

-- The home team submits once BOTH sides are confirmed.
create or replace function public.submit_match(p_match uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    m        public.match%rowtype;
    v_role   text;
    v_team   uuid;
begin
    select role, team_id into v_role, v_team
    from public.user_profile where id = auth.uid();
    if not found then return false; end if;

    select * into m from public.match where id = p_match;
    if not found then return false; end if;
    if not (m.home_confirmed and m.away_confirmed) then return false; end if;
    if m.submitted then return true; end if;

    if v_role = 'admin' then null;
    elsif v_role in ('captain', 'generic')
          and m.match_date = public.league_today()
          and v_team = m.home_team_id then null;
    else return false; end if;

    update public.match set submitted = true where id = p_match;
    return true;
end;
$$;

grant execute on function public.confirm_match_side(uuid, text) to anon, authenticated;
grant execute on function public.submit_match(uuid) to anon, authenticated;

-- Live updates for confirmation / submission state.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public' and tablename = 'match'
    ) then
        alter publication supabase_realtime add table public.match;
    end if;
end $$;
