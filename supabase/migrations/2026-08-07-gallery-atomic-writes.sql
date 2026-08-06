-- ============================================================================
-- NADARL Portal - Atomic gallery item writes
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adding/editing a gallery item touches two tables (gallery_item and its
-- gallery_item_image rows). Doing that as separate client calls leaves a
-- window where a failure between them can leave an item with a stale image
-- list. This wraps the whole write in one transaction.
-- ============================================================================

create or replace function public.save_gallery_item(
    p_id uuid,
    p_description text,
    p_filenames text[]
)
returns table (
    id          uuid,
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
        insert into public.gallery_item (description)
        values (coalesce(trim(p_description), ''))
        returning gallery_item.id into v_id;
    else
        update public.gallery_item
        set description = coalesce(trim(p_description), '')
        where gallery_item.id = p_id;
        if not found then
            raise exception 'gallery item not found';
        end if;
        v_id := p_id;
    end if;

    delete from public.gallery_item_image where gallery_item_id = v_id;

    insert into public.gallery_item_image (gallery_item_id, filename, sort_order)
    select v_id, trim(f), (ord - 1)::integer
    from unnest(p_filenames) with ordinality as t(f, ord)
    where trim(f) <> '';

    return query
    select gi.id, gi.description, gi.created_at, gi.sort_order
    from public.gallery_item gi
    where gi.id = v_id;
end;
$$;

grant execute on function public.save_gallery_item(uuid, text, text[]) to authenticated;
