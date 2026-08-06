-- ============================================================================
-- NADARL Portal - Gallery custom ordering
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds an optional sort_order to gallery_item so admins can manually
-- reorder photos. Items without a sort_order (the default) fall back to
-- newest-first, same as before this migration.
-- ============================================================================

alter table public.gallery_item add column if not exists sort_order integer;

create index if not exists idx_gallery_item_sort_order on public.gallery_item(sort_order);
