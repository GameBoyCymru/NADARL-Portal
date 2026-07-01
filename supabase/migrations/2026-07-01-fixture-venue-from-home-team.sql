-- ============================================================================
-- Fix: fixture_list view now derives venue live from the home team.
--
-- Previously the view used `coalesce(m.venue, th.venue)`, which only falls
-- back to the home team's venue when match.venue is NULL. The fixtures
-- generator stores the venue at generation time, so an empty/blank or stale
-- stored value was returned instead of the home team's current venue.
--
-- Venues are a property of the home team (they play at their home range), so
-- the view now always reads th.venue. Editing a team's venue in the admin
-- dashboard therefore updates the fixtures page immediately.
-- ============================================================================

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
    (m.away_team_id is null)     as is_bye
from public.match m
join public.team th on th.id = m.home_team_id
left join public.team ta on ta.id = m.away_team_id;
