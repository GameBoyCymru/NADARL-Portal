-- ============================================================================
-- NADARL Portal - For Sale listings
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Mirrors the trophy cabinet / photo gallery (trophy_item / gallery_item):
-- each listing can have a name, price, description, and one or more images
-- already uploaded to the Images/sales folder on the server (this table
-- stores the filename + caption only, not the image itself).
-- ============================================================================

create table if not exists public.sale_item (
    id          uuid primary key default gen_random_uuid(),
    name        text not null default '',
    price       text not null default '',
    description text not null default '',
    sort_order  integer,
    created_at  timestamptz not null default now()
);

create index if not exists idx_sale_item_created on public.sale_item(created_at);
create index if not exists idx_sale_item_sort_order on public.sale_item(sort_order);

alter table public.sale_item enable row level security;

drop policy if exists "public read" on public.sale_item;
create policy "public read" on public.sale_item for select using (true);

drop policy if exists "admin manages sale items" on public.sale_item;
create policy "admin manages sale items" on public.sale_item
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.sale_item to anon, authenticated;

create table if not exists public.sale_item_image (
    id            uuid primary key default gen_random_uuid(),
    sale_item_id  uuid not null references public.sale_item(id) on delete cascade,
    filename      text not null,
    sort_order    integer not null default 0,
    created_at    timestamptz not null default now()
);

create index if not exists idx_sale_item_image_item on public.sale_item_image(sale_item_id, sort_order);

alter table public.sale_item_image enable row level security;

drop policy if exists "public read" on public.sale_item_image;
create policy "public read" on public.sale_item_image for select using (true);

drop policy if exists "admin manages sale item images" on public.sale_item_image;
create policy "admin manages sale item images" on public.sale_item_image
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.sale_item_image to anon, authenticated;

-- Atomic add/edit: a write touches both sale_item and its sale_item_image
-- rows, wrapped in one transaction (same pattern as save_trophy_item /
-- save_gallery_item) so a failure partway through can't leave a listing
-- with a stale image list.
create or replace function public.save_sale_item(
    p_id uuid,
    p_name text,
    p_price text,
    p_description text,
    p_filenames text[]
)
returns table (
    id          uuid,
    name        text,
    price       text,
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
        insert into public.sale_item (name, price, description)
        values (coalesce(trim(p_name), ''), coalesce(trim(p_price), ''), coalesce(trim(p_description), ''))
        returning sale_item.id into v_id;
    else
        update public.sale_item
        set name = coalesce(trim(p_name), ''),
            price = coalesce(trim(p_price), ''),
            description = coalesce(trim(p_description), '')
        where sale_item.id = p_id;
        if not found then
            raise exception 'sale item not found';
        end if;
        v_id := p_id;
    end if;

    delete from public.sale_item_image where sale_item_id = v_id;

    insert into public.sale_item_image (sale_item_id, filename, sort_order)
    select v_id, trim(f), (ord - 1)::integer
    from unnest(p_filenames) with ordinality as t(f, ord)
    where trim(f) <> '';

    return query
    select si.id, si.name, si.price, si.description, si.created_at, si.sort_order
    from public.sale_item si
    where si.id = v_id;
end;
$$;

grant execute on function public.save_sale_item(uuid, text, text, text, text[]) to authenticated;
