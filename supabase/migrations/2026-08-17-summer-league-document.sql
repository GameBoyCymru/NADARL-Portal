-- ============================================================================
-- NADARL Portal - Summer League results document
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- One row per season, pointing at a PDF that has already been uploaded to
-- the Documents/summer-league folder on the server (this table stores the
-- filename only, not the PDF itself - same convention as
-- gallery_item/trophy_item for images). Summer League runs within the same
-- season as the normal league, so results are browsed with the same
-- season-picker pattern as fixtures/table (see fetchSeasons/pickCurrentSeason).
--
-- This table previously used a single locked row (id = 1). "create table if
-- not exists" is a no-op against that old table, so anything using this
-- migration to move to the per-season schema needs to actually drop the old
-- shape first - safe here since the only column that mattered (filename)
-- was always test data.
-- ============================================================================

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'summer_league_document' and column_name = 'id'
    ) then
        drop table public.summer_league_document;
    end if;
end $$;

create table if not exists public.summer_league_document (
    season_id   uuid primary key references public.season(id) on delete cascade,
    filename    text not null,        -- e.g. 'results-2026.pdf', in Documents/summer-league/
    uploaded_at timestamptz not null default now()
);

alter table public.summer_league_document enable row level security;

drop policy if exists "public read" on public.summer_league_document;
create policy "public read" on public.summer_league_document
    for select using (true);

drop policy if exists "admin manages summer league document" on public.summer_league_document;
create policy "admin manages summer league document" on public.summer_league_document
    for all using (public.is_admin()) with check (public.is_admin());

grant select on public.summer_league_document to anon, authenticated;
grant insert, update, delete on public.summer_league_document to authenticated;
