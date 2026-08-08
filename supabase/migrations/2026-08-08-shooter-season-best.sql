-- Makes "Season Best" a persisted, per-season ratcheting record, the same
-- way personal_best (2026-08-07-shooter-personal-best-persist.sql) works for
-- the all-time Personal Best - except scoped to one season instead of
-- forever, so an admin's "Reset Scores" on a season clears that season's
-- best but leaves every other season's (including the all-time Personal
-- Best) untouched.
--
-- Unlike shooter.personal_best (a column that must coexist with captains'
-- ordinary name/role writes on the same row, hence the column-level guard
-- trigger there), this is its own table that only admins and the system
-- ratchet triggers ever write to - so a plain admin-only RLS policy is
-- enough; no column-level guard needed.

create table if not exists public.shooter_season_best (
    shooter_id    uuid not null references public.shooter(id) on delete cascade,
    season_id     uuid not null references public.season(id) on delete cascade,
    personal_best integer,
    primary key (shooter_id, season_id)
);

alter table public.shooter_season_best enable row level security;

drop policy if exists "public read" on public.shooter_season_best;
create policy "public read" on public.shooter_season_best for select using (true);

drop policy if exists "admin manages shooter season best" on public.shooter_season_best;
create policy "admin manages shooter season best" on public.shooter_season_best
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.shooter_season_best to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Backfill: bake every currently-submitted match's result into its season's
-- best once, so nobody's displayed Season Best regresses when this
-- migration runs.
-- ----------------------------------------------------------------------------
insert into public.shooter_season_best (shooter_id, season_id, personal_best)
select sc.shooter_id, m.season_id, max(sc.total)
from public.score sc
join public.match m on m.id = sc.match_id
where m.submitted and m.season_id is not null
group by sc.shooter_id, m.season_id
on conflict (shooter_id, season_id) do update
    set personal_best = greatest(
        coalesce(shooter_season_best.personal_best, 0),
        excluded.personal_best
    );

-- ----------------------------------------------------------------------------
-- Ratchet triggers: a season's best only ever moves up within that season,
-- and only in response to an actually-submitted match. Two triggers cover
-- both write orders, same as the personal_best ratchet.
-- ----------------------------------------------------------------------------
create or replace function public.ratchet_season_best_from_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not NEW.submitted or NEW.season_id is null then
        return NEW;
    end if;
    if TG_OP = 'UPDATE' and OLD.submitted then
        return NEW; -- already ratcheted when it first became submitted
    end if;

    insert into public.shooter_season_best (shooter_id, season_id, personal_best)
    select sc.shooter_id, NEW.season_id, sc.total
    from public.score sc
    where sc.match_id = NEW.id
    on conflict (shooter_id, season_id) do update
        set personal_best = excluded.personal_best
        where excluded.personal_best > coalesce(shooter_season_best.personal_best, 0);

    return NEW;
end;
$$;

drop trigger if exists match_submitted_ratchet_season_best on public.match;
create trigger match_submitted_ratchet_season_best
    after insert or update of submitted on public.match
    for each row
    execute function public.ratchet_season_best_from_match();

create or replace function public.ratchet_season_best_from_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_season_id uuid;
    v_submitted boolean;
begin
    select season_id, submitted into v_season_id, v_submitted
    from public.match where id = NEW.match_id;

    if v_season_id is null or not v_submitted then
        return NEW;
    end if;

    insert into public.shooter_season_best (shooter_id, season_id, personal_best)
    values (NEW.shooter_id, v_season_id, NEW.total)
    on conflict (shooter_id, season_id) do update
        set personal_best = excluded.personal_best
        where excluded.personal_best > coalesce(shooter_season_best.personal_best, 0);

    return NEW;
end;
$$;

drop trigger if exists score_ratchet_season_best on public.score;
create trigger score_ratchet_season_best
    after insert or update of total on public.score
    for each row
    execute function public.ratchet_season_best_from_score();

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - season_best now reads the persisted per-season
-- value, with the live computed max kept only as a defensive fallback.
-- season_best_override surfaces the admin-set value directly (mirrors
-- pb_override) so the Team page's editor can show/edit it.
-- Changing the return table shape requires dropping the function first.
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
    season_best_override integer,
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
            coalesce(sh.personal_best, 0),
            coalesce(max(sc.total) filter (where m.submitted), 0)
        )                                                                              as best,
        sh.personal_best as pb_override,
        greatest(
            coalesce(ssb.personal_best, 0),
            coalesce(max(sc.total) filter (
                where m.submitted and m.season_id = p_season_id
            ), 0)
        )                                                                              as season_best,
        ssb.personal_best as season_best_override,
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
    left join public.shooter_season_best ssb
           on ssb.shooter_id = sh.id and ssb.season_id = p_season_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue, ssb.personal_best
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- shooter_stats view (current season only) - same treatment, for the
-- fetchTeamShootersStats/fetchAllShooterStats callers.
-- ----------------------------------------------------------------------------
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
        coalesce(sh.personal_best, 0),
        coalesce(max(sc.total) filter (where m.submitted), 0)
    )                                                                              as best,
    greatest(
        coalesce(ssb.personal_best, 0),
        coalesce(max(sc.total) filter (
            where m.submitted and m.season_id = cur.season_id
        ), 0)
    )                                                                              as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null::date)                                     as handicap,
    coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played,
    sh.personal_best as pb_override,
    ssb.personal_best as season_best_override
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
left join public.shooter_season_best ssb
       on ssb.shooter_id = sh.id and ssb.season_id = cur.season_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id, sh.personal_best, ssb.personal_best;
