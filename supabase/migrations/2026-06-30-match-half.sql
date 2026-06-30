-- ============================================================================
-- NADARL Portal - Match half flag (1 = first half, 2 = second half / handicaps)
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- The league splits into two halves: the first round-robin (no handicaps) and
-- the mirrored second round-robin (handicaps). This column records which half
-- each match belongs to so handicap logic can be applied later.
-- ============================================================================

alter table public.match
    add column if not exists half smallint not null default 1
    check (half in (1, 2));

-- Backfill existing matches so everything defaults to the first half.
-- (Re-running the fixtures generator will set the correct values.)
update public.match set half = 1 where half is null;

-- Expose the half through the fixture_list view (drop+recreate to add column).
drop view if exists public.fixture_list;
create view public.fixture_list with (security_invoker = true) as
select
    m.id,
    m.half,
    m.match_date      as date,
    m.home_team_id,
    th.name           as home_team,
    m.away_team_id,
    ta.name           as away_team,
    coalesce(m.venue, th.venue) as venue,
    (m.away_team_id is null)     as is_bye
from public.match m
join public.team th on th.id = m.home_team_id
left join public.team ta on ta.id = m.away_team_id;

grant select on public.fixture_list to anon, authenticated;
