-- ============================================================================
-- NADARL Portal - Season exclusions (no-match Mondays with a reason)
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Records Mondays on which no matches are played (bank holidays, cup comps,
-- catch-up weeks) with a human-readable reason. Set by the admin fixtures
-- generator and surfaced on the public fixtures page as blocked days.
-- ============================================================================

create table if not exists public.exclusion (
    id          uuid primary key default gen_random_uuid(),
    season_id   uuid not null references public.season(id) on delete cascade,
    match_date  date not null,
    reason      text not null default 'Bank holiday',
    unique (season_id, match_date)
);

create index if not exists idx_exclusion_season on public.exclusion(season_id);
create index if not exists idx_exclusion_date   on public.exclusion(match_date);

alter table public.exclusion enable row level security;

-- Public can read exclusions; only admins can manage them.
drop policy if exists "public read" on public.exclusion;
create policy "public read" on public.exclusion for select using (true);

drop policy if exists "admin manages exclusions" on public.exclusion;
create policy "admin manages exclusions" on public.exclusion
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.exclusion to anon, authenticated;
