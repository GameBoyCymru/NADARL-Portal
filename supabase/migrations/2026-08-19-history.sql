-- ============================================================================
-- NADARL Portal - League History timeline
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Each row is one timeline entry (year/era, heading, body text, and an
-- optional image already uploaded to the Images/history folder on the
-- server - this table stores the filename only, not the image itself).
-- Mirrors gallery_item / trophy_item for admin-managed, publicly readable
-- content.
-- ============================================================================

create table if not exists public.history_item (
    id          uuid primary key default gen_random_uuid(),
    year        text not null default '',
    heading     text not null default '',
    body        text not null default '',
    filename    text not null default '',
    sort_order  integer,
    created_at  timestamptz not null default now()
);

create index if not exists idx_history_item_created on public.history_item(created_at);
create index if not exists idx_history_item_sort_order on public.history_item(sort_order);

alter table public.history_item enable row level security;

drop policy if exists "public read" on public.history_item;
create policy "public read" on public.history_item for select using (true);

drop policy if exists "admin manages history items" on public.history_item;
create policy "admin manages history items" on public.history_item
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.history_item to anon, authenticated;
