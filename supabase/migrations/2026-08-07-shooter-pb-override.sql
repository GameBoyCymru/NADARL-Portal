-- Lets an admin override a shooter's all-time Personal Best, for shooters
-- with real history that predates this site's match records. The override
-- is a floor, not a hard replacement: displayed "best" is the greater of
-- the override and whatever the site has actually recorded, so a strong
-- future match still updates it normally.
--
-- Admin-only is enforced with a trigger rather than RLS/column grants: the
-- existing "manage shooters" RLS policy already lets a team's captain
-- update that row (name, role, ...), and Postgres column-level GRANTs can't
-- distinguish an app-admin from a captain since both connect as the same
-- `authenticated` role - only public.is_admin() (checked per-request) can.

alter table public.shooter
    add column if not exists pb_override integer;

create or replace function public.enforce_shooter_pb_override_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.pb_override is distinct from OLD.pb_override and not public.is_admin() then
        raise exception 'Only admins can edit a shooter''s personal best override.';
    end if;
    return NEW;
end;
$$;

drop trigger if exists shooter_pb_override_admin_only on public.shooter;
create trigger shooter_pb_override_admin_only
    before update on public.shooter
    for each row
    execute function public.enforce_shooter_pb_override_admin_only();

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - fold pb_override into `best`, and expose the
-- raw override value so the admin UI can prefill its edit field.
-- ----------------------------------------------------------------------------
drop function if exists public.shooter_stats_for_season(uuid);

create function public.shooter_stats_for_season(p_season_id uuid)
returns table (
    shooter_id           uuid,
    shooter_no           integer,
    name                 text,
    role                 text,
    team_id              uuid,
    team_name            text,
    team_slug            text,
    team_venue           text,
    matches_played       bigint,
    best                 integer,
    pb_override          integer,
    season_best          integer,
    tens                 bigint,
    average              numeric,
    handicap             numeric,
    total_matches_played bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        sh.id            as shooter_id,
        sh.shooter_no,
        sh.name,
        sh.role,
        sh.team_id,
        t.name           as team_name,
        t.slug           as team_slug,
        t.venue          as team_venue,
        coalesce(count(sc.id) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as matches_played,
        greatest(
            coalesce(max(sc.total) filter (where m.submitted), 0),
            coalesce(sh.pb_override, 0)
        )                                                                              as best,
        sh.pb_override,
        coalesce(max(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as season_best,
        coalesce(sum(sc.tens) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as tens,
        coalesce(round(avg(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 1), 0)                                                                      as average,
        public.shooter_handicap(sh.id, null::date)                                     as handicap,
        coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played
    from public.shooter sh
    join public.team   t   on t.id  = sh.team_id
    left join public.score sc on sc.shooter_id = sh.id
    left join public.match  m  on m.id = sc.match_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- shooter_stats view - same greatest() treatment, for consistency.
-- ----------------------------------------------------------------------------
-- The view already had a trailing total_matches_played column (see
-- 2026-07-31-total-matches-played.sql) - it must stay in place, with
-- pb_override appended after it, since CREATE OR REPLACE VIEW can only
-- append new columns, never rename/reorder/remove existing ones.
create or replace view public.shooter_stats with (security_invoker = true) as
with cur as (
    select id as season_id
    from public.season
    order by
        case when start_date <= current_date and end_date >= current_date then 0 else 1 end,
        case when is_current then 0 else 1 end,
        start_date desc nulls last
    limit 1
)
select
    sh.id            as shooter_id,
    sh.shooter_no,
    sh.name,
    sh.role,
    sh.team_id,
    t.name           as team_name,
    t.slug           as team_slug,
    t.venue          as team_venue,
    coalesce(count(sc.id) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as matches_played,
    greatest(
        coalesce(max(sc.total) filter (where m.submitted), 0),
        coalesce(sh.pb_override, 0)
    )                                                                              as best,
    coalesce(max(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null::date)                                     as handicap,
    coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played,
    sh.pb_override
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id, sh.pb_override;
