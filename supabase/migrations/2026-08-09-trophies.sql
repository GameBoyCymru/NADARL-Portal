-- ============================================================================
-- NADARL Portal - Trophy cabinet
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Mirrors the photo gallery (gallery_item / gallery_item_image): each trophy
-- can have a name, a description, and one or more images already uploaded
-- to the Images/trophies folder on the server (this table stores the
-- filename + caption only, not the image itself).
-- ============================================================================

create table if not exists public.trophy_item (
    id          uuid primary key default gen_random_uuid(),
    name        text not null default '',
    description text not null default '',
    sort_order  integer,
    created_at  timestamptz not null default now()
);

create index if not exists idx_trophy_item_created on public.trophy_item(created_at);
create index if not exists idx_trophy_item_sort_order on public.trophy_item(sort_order);

alter table public.trophy_item enable row level security;

drop policy if exists "public read" on public.trophy_item;
create policy "public read" on public.trophy_item for select using (true);

drop policy if exists "admin manages trophies" on public.trophy_item;
create policy "admin manages trophies" on public.trophy_item
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.trophy_item to anon, authenticated;

create table if not exists public.trophy_item_image (
    id              uuid primary key default gen_random_uuid(),
    trophy_item_id  uuid not null references public.trophy_item(id) on delete cascade,
    filename        text not null,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now()
);

create index if not exists idx_trophy_item_image_item on public.trophy_item_image(trophy_item_id, sort_order);

alter table public.trophy_item_image enable row level security;

drop policy if exists "public read" on public.trophy_item_image;
create policy "public read" on public.trophy_item_image for select using (true);

drop policy if exists "admin manages trophy images" on public.trophy_item_image;
create policy "admin manages trophy images" on public.trophy_item_image
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.trophy_item_image to anon, authenticated;

-- Atomic add/edit: a write touches both trophy_item and its
-- trophy_item_image rows, wrapped in one transaction (same pattern as
-- save_gallery_item) so a failure partway through can't leave a trophy
-- with a stale image list.
create or replace function public.save_trophy_item(
    p_id uuid,
    p_name text,
    p_description text,
    p_filenames text[]
)
returns table (
    id          uuid,
    name        text,
    description text,
    created_at  timestamptz,
    sort_order  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;

    if p_id is null then
        insert into public.trophy_item (name, description)
        values (coalesce(trim(p_name), ''), coalesce(trim(p_description), ''))
        returning trophy_item.id into v_id;
    else
        update public.trophy_item
        set name = coalesce(trim(p_name), ''),
            description = coalesce(trim(p_description), '')
        where trophy_item.id = p_id;
        if not found then
            raise exception 'trophy item not found';
        end if;
        v_id := p_id;
    end if;

    delete from public.trophy_item_image where trophy_item_id = v_id;

    insert into public.trophy_item_image (trophy_item_id, filename, sort_order)
    select v_id, trim(f), (ord - 1)::integer
    from unnest(p_filenames) with ordinality as t(f, ord)
    where trim(f) <> '';

    return query
    select ti.id, ti.name, ti.description, ti.created_at, ti.sort_order
    from public.trophy_item ti
    where ti.id = v_id;
end;
$$;

grant execute on function public.save_trophy_item(uuid, text, text, text[]) to authenticated;
