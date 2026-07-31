-- "Current season" was decided purely by the season.is_current flag, which
-- is set (checked by default) when a season is created - so pre-loading next
-- season's fixtures in advance silently made it "current" before it had
-- started, and the Team page (shooter_stats view) started showing its
-- (empty) stats.
--
-- Derive the current season from today's date instead: the season whose
-- start_date/end_date span covers today wins. Falls back to the is_current
-- flag, then to the most recently-started season, if no date range covers
-- today (e.g. between seasons, or dates not set).

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
    coalesce(max(sc.total) filter (where m.submitted), 0)                          as best,
    coalesce(max(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null::date)                                     as handicap
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id;
