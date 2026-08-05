-- ============================================================================
-- NADARL Portal - Photo gallery
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Each row points at an image file that has already been uploaded to the
-- Images/gallery folder on the server (this table stores the filename +
-- caption only, not the image itself).
-- ============================================================================

create table if not exists public.gallery_item (
    id          uuid primary key default gen_random_uuid(),
    filename    text not null,        -- e.g. 'champions-2023.jpg', in Images/gallery/
    description text not null default '',
    created_at  timestamptz not null default now()
);

create index if not exists idx_gallery_item_created on public.gallery_item(created_at);

alter table public.gallery_item enable row level security;

-- Public can read gallery items; only admins can manage them.
drop policy if exists "public read" on public.gallery_item;
create policy "public read" on public.gallery_item for select using (true);

drop policy if exists "admin manages gallery" on public.gallery_item;
create policy "admin manages gallery" on public.gallery_item
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.gallery_item to anon, authenticated;
