-- "Personal Best" (all-time) stops being its own persisted/overridable
-- value and becomes purely derived: the highest of every season's Season
-- Best (shooter_season_best - see 2026-08-08-shooter-season-best.sql),
-- which is already tracked and cleared per season.
--
-- This is what "Reset Season" (renamed from "Reset Scores") means going
-- forward: resetting a season's scores deletes that season's
-- shooter_season_best rows, so it also removes that season's contribution
-- to the shooter's all-time best - not just its display. Other seasons'
-- records, and therefore the shooter's overall best if it was set
-- elsewhere, are untouched.
--
-- Any pre-site history an admin wants to seed is now entered as a Season
-- Best override against whichever season it actually happened in (already
-- supported), instead of a season-less global override - there's no longer
-- a place for a PB that isn't attributable to a season.

-- ----------------------------------------------------------------------------
-- Drop the old all-time ratchet machinery and its admin-only guard.
-- ----------------------------------------------------------------------------
drop trigger if exists match_submitted_ratchet_pb on public.match;
drop trigger if exists score_ratchet_pb on public.score;
drop trigger if exists shooter_pb_override_admin_only on public.shooter;

drop function if exists public.ratchet_pb_from_match();
drop function if exists public.ratchet_pb_from_score();
drop function if exists public.enforce_shooter_pb_override_admin_only();

-- shooter_stats (recreated further down) references personal_best, so it
-- must be dropped before the column can go - CREATE OR REPLACE VIEW can't
-- remove columns anyway (see below), so it needs a full drop regardless.
drop view if exists public.shooter_stats;

alter table public.shooter drop column if exists personal_best;

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - `best` now derives from the max Season Best
-- across every season the shooter has one for (a subquery, since it must
-- ignore p_season_id). pb_override is gone; season_best_override (added in
-- 2026-08-08-shooter-season-best.sql) already covers the per-season editor.
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
            coalesce((
                select max(ssb.personal_best)
                from public.shooter_season_best ssb
                where ssb.shooter_id = sh.id
            ), 0),
            coalesce(max(sc.total) filter (where m.submitted), 0)
        )                                                                              as best,
        greatest(
            coalesce(ssb_cur.personal_best, 0),
            coalesce(max(sc.total) filter (
                where m.submitted and m.season_id = p_season_id
            ), 0)
        )                                                                              as season_best,
        ssb_cur.personal_best as season_best_override,
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
    left join public.shooter_season_best ssb_cur
           on ssb_cur.shooter_id = sh.id and ssb_cur.season_id = p_season_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue, ssb_cur.personal_best
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- shooter_stats view - same treatment. pb_override is dropped from the
-- output entirely, which CREATE OR REPLACE VIEW can't do (it can only
-- append columns), so it was dropped above (ahead of the column drop it
-- depended on) and gets recreated from scratch here - its grant needs
-- reissuing too as a result.
-- ----------------------------------------------------------------------------
create view public.shooter_stats with (security_invoker = true) as
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
        coalesce((
            select max(ssb.personal_best)
            from public.shooter_season_best ssb
            where ssb.shooter_id = sh.id
        ), 0),
        coalesce(max(sc.total) filter (where m.submitted), 0)
    )                                                                              as best,
    greatest(
        coalesce(ssb_cur.personal_best, 0),
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
    ssb_cur.personal_best as season_best_override
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
left join public.shooter_season_best ssb_cur
       on ssb_cur.shooter_id = sh.id and ssb_cur.season_id = cur.season_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id, ssb_cur.personal_best;

grant select on public.shooter_stats to anon, authenticated;
