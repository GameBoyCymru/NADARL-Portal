-- Per-shooter, per-match score log (drives the new Shooter Profile page's
-- season results table). One row per score entry, with the opponent name
-- and home/away flag already resolved so the page doesn't need extra joins.
-- Callers filter to submitted = true and a specific season_id themselves,
-- same convention as shooter_stats_for_season.

create or replace view public.shooter_match_history with (security_invoker = true) as
select
    sc.id                as score_id,
    sc.shooter_id,
    sc.match_id,
    m.season_id,
    m.match_date         as date,
    m.half,
    m.submitted,
    sc.team_id,
    t.name                as team_name,
    (m.home_team_id = sc.team_id)                              as is_home,
    case
        when m.home_team_id = sc.team_id then coalesce(away.name, 'BYE')
        else home.name
    end                    as opponent_name,
    home.venue             as venue,
    sc.shots,
    sc.total,
    sc.tens
from public.score sc
join public.match  m    on m.id  = sc.match_id
join public.team   t    on t.id  = sc.team_id
join public.team   home on home.id = m.home_team_id
left join public.team away on away.id = m.away_team_id;

grant select on public.shooter_match_history to anon, authenticated;
