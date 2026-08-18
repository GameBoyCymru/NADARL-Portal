-- The Rules page becomes a single PDF instead of hand-maintained HTML
-- content: an admin uploads the rulebook to Documents/rules on the server
-- and records its filename here, the same static-file convention as
-- Summer League newsletters and competition results.
-- Single-row config table, mirroring handicap_config (2026-07-04-handicap.sql).

create table if not exists public.rules_document (
    id         smallint primary key default 1 check (id = 1),
    filename   text,
    updated_at timestamptz not null default now()
);

insert into public.rules_document (id, filename)
values (1, null)
on conflict (id) do nothing;

alter table public.rules_document enable row level security;

drop policy if exists "public read" on public.rules_document;
create policy "public read" on public.rules_document
    for select using (true);

drop policy if exists "admin manages rules document" on public.rules_document;
create policy "admin manages rules document" on public.rules_document
    for all using (public.is_admin()) with check (public.is_admin());

-- A new table's base privileges aren't covered by the older blanket grant in
-- 2026-06-29-captains-and-permissions.sql (only applies to tables that
-- existed at the time it ran) - grant explicitly, as handicap_config also
-- needed (2026-08-02-handicap-config-write-grant.sql).
grant select, insert, update, delete on public.rules_document to anon, authenticated;
