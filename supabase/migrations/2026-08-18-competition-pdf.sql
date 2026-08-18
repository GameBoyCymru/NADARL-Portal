-- Competitions are now results-as-PDF instead of a per-shooter score entry
-- table: an admin uploads a results PDF to Documents/competitions (same
-- static-file convention as Summer League newsletters) and records its
-- filename here. See 2026-08-08-competitions-events.sql for the original
-- competition_entry design this replaces.

alter table public.competition add column if not exists filename text;

drop table if exists public.competition_entry;
