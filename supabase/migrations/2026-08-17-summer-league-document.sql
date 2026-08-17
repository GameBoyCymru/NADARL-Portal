-- ============================================================================
-- NADARL Portal - Summer League newsletters
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Summer League publishes a weekly/bi-weekly newsletter PDF, each already
-- uploaded to the Documents/summer-league folder on the server (this table
-- stores the filename + title only, not the PDF itself - same convention as
-- gallery_item/trophy_item for images). Many newsletters per season, newest
-- first - not a single locked document.
--
-- This table previously went through single-row (id = 1) and one-row-per-
-- season (season_id primary key) shapes. Both are test/dev data only, so
-- this migration just drops whatever's there and recreates on the current
-- (multi-row-per-season) shape.
--
-- sort_order lets an admin manually reorder newsletters (fix one added out
-- of sequence, etc), the same way seasons/gallery/trophy/sale items are
-- reordered. New newsletters default to newest-first (see
-- addSummerLeagueDocument), same as before this column existed.
-- ============================================================================

drop table if exists public.summer_league_document;

create table public.summer_league_document (
    id          uuid primary key default gen_random_uuid(),
    season_id   uuid not null references public.season(id) on delete cascade,
    title       text not null default '',
    filename    text not null,        -- e.g. 'week-3-results.pdf', in Documents/summer-league/
    sort_order  integer not null,
    created_at  timestamptz not null default now()
);

create index idx_summer_league_document_season on public.summer_league_document(season_id, sort_order);

alter table public.summer_league_document enable row level security;

drop policy if exists "public read" on public.summer_league_document;
create policy "public read" on public.summer_league_document
    for select using (true);

drop policy if exists "admin manages summer league document" on public.summer_league_document;
create policy "admin manages summer league document" on public.summer_league_document
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.summer_league_document to anon, authenticated;
