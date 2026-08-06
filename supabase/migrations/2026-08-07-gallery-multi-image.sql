-- ============================================================================
-- NADARL Portal - Multiple images per gallery item
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- A gallery item can now have several photos (e.g. a match writeup with a
-- handful of shots) instead of exactly one. Each row here points at an image
-- already uploaded to Images/gallery/ on the server, same as before.
-- ============================================================================

create table if not exists public.gallery_item_image (
    id              uuid primary key default gen_random_uuid(),
    gallery_item_id uuid not null references public.gallery_item(id) on delete cascade,
    filename        text not null,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now()
);

create index if not exists idx_gallery_item_image_item on public.gallery_item_image(gallery_item_id, sort_order);

alter table public.gallery_item_image enable row level security;

drop policy if exists "public read" on public.gallery_item_image;
create policy "public read" on public.gallery_item_image for select using (true);

drop policy if exists "admin manages gallery images" on public.gallery_item_image;
create policy "admin manages gallery images" on public.gallery_item_image
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.gallery_item_image to anon, authenticated;

-- Carry each existing item's single photo over as its first image, then drop
-- the now-superseded column. Guarded so a second run (the column will
-- already be gone) is a no-op instead of erroring.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'gallery_item' and column_name = 'filename'
    ) then
        insert into public.gallery_item_image (gallery_item_id, filename, sort_order)
        select id, filename, 0
        from public.gallery_item
        where filename is not null and filename <> ''
          and not exists (
              select 1 from public.gallery_item_image gii where gii.gallery_item_id = gallery_item.id
          );

        alter table public.gallery_item drop column filename;
    end if;
end
$$;
