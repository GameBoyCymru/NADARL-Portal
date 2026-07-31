-- The fixtures page had no way to scope matches to a single season, so
-- pre-loading next season's fixtures made them show up mixed in with (or
-- instead of) the current season's on the Fixtures page. Expose season_id
-- on fixture_list so the page can filter to one season, the same way the
-- League Table now does.
--
-- season_id is appended at the end of the select list (rather than inline
-- with the other match columns) so this can be a plain CREATE OR REPLACE -
-- Postgres only allows adding columns to a view when they're appended.

create or replace view public.fixture_list with (security_invoker = true) as
select
    m.id,
    m.half,
    m.match_date      as date,
    m.home_team_id,
    th.name           as home_team,
    m.away_team_id,
    ta.name           as away_team,
    th.venue          as venue,
    (m.away_team_id is null)     as is_bye,
    m.season_id
from public.match m
join public.team th on th.id = m.home_team_id
left join public.team ta on ta.id = m.away_team_id;
