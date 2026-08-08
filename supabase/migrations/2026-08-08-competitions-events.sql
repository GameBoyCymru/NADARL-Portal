-- Competitions, Events, and a per-match venue/date override for the admin
-- fixture editor. Mirrors the exclusion table's public-read/admin-write
-- shape. See the "Competitions, Events, Exceptions admin UI, and Fixture
-- Editing" plan for full context.

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.competition (
    id          uuid primary key default gen_random_uuid(),
    season_id   uuid references public.season(id) on delete cascade,
    event_date  date not null,
    name        text not null,
    venue       text,
    description text
);

create table if not exists public.event (
    id          uuid primary key default gen_random_uuid(),
    season_id   uuid references public.season(id) on delete cascade,
    event_date  date not null,
    name        text not null,
    venue       text,
    attire      text,
    description text
);

-- One row per shooter per competition. Generic MVP: a single numeric score
-- plus free-text notes - custom per-competition-type formats can build on
-- top of this later without a schema change (notes is the escape hatch).
create table if not exists public.competition_entry (
    id             uuid primary key default gen_random_uuid(),
    competition_id uuid not null references public.competition(id) on delete cascade,
    shooter_id     uuid not null references public.shooter(id) on delete cascade,
    score          integer not null default 0,
    notes          text,
    unique (competition_id, shooter_id)
);

create index if not exists idx_competition_season on public.competition(season_id);
create index if not exists idx_competition_date on public.competition(event_date);
create index if not exists idx_event_season on public.event(season_id);
create index if not exists idx_event_date on public.event(event_date);
create index if not exists idx_competition_entry_competition on public.competition_entry(competition_id);
create index if not exists idx_competition_entry_shooter on public.competition_entry(shooter_id);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY - public read, admin-only write (mirrors exclusion).
-- ----------------------------------------------------------------------------

alter table public.competition enable row level security;
alter table public.event enable row level security;
alter table public.competition_entry enable row level security;

drop policy if exists "public read" on public.competition;
create policy "public read" on public.competition for select using (true);

drop policy if exists "public read" on public.event;
create policy "public read" on public.event for select using (true);

drop policy if exists "public read" on public.competition_entry;
create policy "public read" on public.competition_entry for select using (true);

drop policy if exists "admin manages competitions" on public.competition;
create policy "admin manages competitions" on public.competition
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin manages events" on public.event;
create policy "admin manages events" on public.event
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin manages competition entries" on public.competition_entry;
create policy "admin manages competition entries" on public.competition_entry
    for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete
    on public.competition, public.event, public.competition_entry
    to anon, authenticated;

-- Live-updating leaderboard while an admin enters results.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public' and tablename = 'competition_entry'
    ) then
        alter publication supabase_realtime add table public.competition_entry;
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- fixture_list - now honours a per-match venue override (match.venue) if an
-- admin has set one via the fixture editor, falling back to the home team's
-- current registered venue otherwise. An edited venue is a deliberate,
-- permanent override for that match - it will not track later changes to
-- the team's registered venue.
-- ----------------------------------------------------------------------------
create or replace view public.fixture_list with (security_invoker = true) as
select
    m.id,
    m.half,
    m.match_date      as date,
    m.home_team_id,
    th.name           as home_team,
    m.away_team_id,
    ta.name           as away_team,
    coalesce(m.venue, th.venue) as venue,
    (m.away_team_id is null)    as is_bye,
    m.season_id
from public.match m
join public.team th on th.id = m.home_team_id
left join public.team ta on ta.id = m.away_team_id;
