-- Personal Best vs Season Best.
--   best         -> all-time personal best (persists across seasons)
--   season_best  -> best within the current season (resets each season)
-- matches_played / tens / average are now scoped to the current season, so the
-- Team Statistics page reflects the season in progress.
-- The view is dropped first because CREATE OR REPLACE VIEW cannot insert a new
-- column (season_best) into the middle of the existing column list.

drop view if exists public.shooter_stats;

create view public.shooter_stats with (security_invoker = true) as
with cur as (
    select id as season_id from public.season where is_current limit 1
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
    coalesce(max(sc.total) filter (where m.submitted), 0)                          as best,
    coalesce(max(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id;

-- Re-grant SELECT (dropping the view removed the previous grants).
grant select on public.shooter_stats to anon, authenticated;
