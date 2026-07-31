-- Lets the League Table page look up any season, not just the current one.
-- shooter_stats (the view) is hard-scoped to is_current, so add a function
-- variant that takes an explicit season_id. Same columns/logic as the view
-- in 2026-07-03-season-best.sql, just with `cur.season_id` swapped for the
-- p_season_id parameter.

create or replace function public.shooter_stats_for_season(p_season_id uuid)
returns table (
    shooter_id     uuid,
    shooter_no     integer,
    name           text,
    role           text,
    team_id        uuid,
    team_name      text,
    team_slug      text,
    team_venue     text,
    matches_played bigint,
    best           integer,
    season_best    integer,
    tens           bigint,
    average        numeric
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
        coalesce(max(sc.total) filter (where m.submitted), 0)                          as best,
        coalesce(max(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as season_best,
        coalesce(sum(sc.tens) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as tens,
        coalesce(round(avg(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 1), 0)                                                                      as average
    from public.shooter sh
    join public.team   t   on t.id  = sh.team_id
    left join public.score sc on sc.shooter_id = sh.id
    left join public.match  m  on m.id = sc.match_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;
