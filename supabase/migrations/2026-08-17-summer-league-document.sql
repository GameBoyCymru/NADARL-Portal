-- ============================================================================
-- NADARL Portal - Summer League periods and newsletters
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Summer League runs once a year and doesn't line up with the main league's
-- season boundaries (it happens at the end of one season, not the start of
-- the next), so it gets its own standalone pagination - summer_league_period
-- - completely decoupled from the season table. sort_order is manually
-- editable (see reorderSummerLeaguePeriods) so historical years can be
-- backfilled or fixed if added out of order; new periods default to the end
-- of the list (most recent).
--
-- summer_league_document (the newsletters) previously went through single-
-- row (id = 1), one-row-per-season (season_id primary key), and multi-row-
-- per-season shapes. All test/dev data only, so this migration just drops
-- whatever's there and recreates on the current (multi-row-per-period)
-- shape.
-- ============================================================================

create table if not exists public.summer_league_period (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,     -- e.g. '2026'
    sort_order  integer not null,
    is_current  boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Additive for installs where this table already existed before is_current
-- was introduced ("create table if not exists" above is a no-op there.)
alter table public.summer_league_period add column if not exists is_current boolean not null default false;

create index if not exists idx_summer_league_period_sort_order on public.summer_league_period(sort_order);

alter table public.summer_league_period enable row level security;

drop policy if exists "public read" on public.summer_league_period;
create policy "public read" on public.summer_league_period
    for select using (true);

drop policy if exists "admin manages summer league periods" on public.summer_league_period;
create policy "admin manages summer league periods" on public.summer_league_period
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.summer_league_period to anon, authenticated;

drop table if exists public.summer_league_document;

create table public.summer_league_document (
    id           uuid primary key default gen_random_uuid(),
    period_id    uuid not null references public.summer_league_period(id) on delete cascade,
    title        text not null default '',
    filename     text not null,        -- e.g. 'week-3-results.pdf', in Documents/summer-league/
    sort_order   integer not null,
    published_at date not null default current_date,  -- shown on the page; editable, unlike created_at (e.g. to backfill the true date for several added in bulk)
    created_at   timestamptz not null default now()
);

create index idx_summer_league_document_period on public.summer_league_document(period_id, sort_order);

alter table public.summer_league_document enable row level security;

drop policy if exists "public read" on public.summer_league_document;
create policy "public read" on public.summer_league_document
    for select using (true);

drop policy if exists "admin manages summer league document" on public.summer_league_document;
create policy "admin manages summer league document" on public.summer_league_document
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.summer_league_document to anon, authenticated;
