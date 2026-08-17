-- ============================================================================
-- NADARL Portal - Manually orderable seasons
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Seasons used to be listed purely alphabetically by name, which breaks
-- down for backfilling historical seasons (inserting one "before" the
-- current one) or fixing a season that got entered in the wrong order.
-- Adds a manual sort_order column, seeded from the existing alphabetical
-- order so nothing moves the first time this runs.
-- ============================================================================

alter table public.season add column if not exists sort_order integer;

with numbered as (
    select id, row_number() over (order by sort_order nulls last, name) as rn
    from public.season
)
update public.season s
set sort_order = numbered.rn
from numbered
where s.id = numbered.id and s.sort_order is distinct from numbered.rn;

create index if not exists idx_season_sort_order on public.season(sort_order);
