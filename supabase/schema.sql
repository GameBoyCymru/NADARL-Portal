-- ============================================================================
-- NADARL Portal - Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL > New query).
-- Safe to run once. Uses create-if-not-exists pattern.
-- ============================================================================

-- Required extension for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.season (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,          -- e.g. '2026-27'
    start_date  date,
    end_date    date,
    is_current  boolean not null default false
);

create table if not exists public.team (
    id    uuid primary key default gen_random_uuid(),
    name  text not null unique,                -- e.g. 'Belle Vue Rifles'
    venue text not null,                       -- e.g. 'Belle Vue'
    slug  text not null unique                 -- e.g. 'belle-vue-rifles' (image filename)
);

create table if not exists public.shooter (
    id      uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.team(id) on delete cascade,
    name    text not null,                     -- e.g. 'J. Thompson'
    role    text check (role in ('captain','secretary','treasurer')),
    unique (team_id, name)
);

create table if not exists public.match (
    id            uuid primary key default gen_random_uuid(),
    season_id     uuid references public.season(id) on delete set null,
    match_date    date not null,
    home_team_id  uuid not null references public.team(id),
    away_team_id  uuid references public.team(id),   -- NULL means a BYE week
    venue         text,
    unique (match_date, home_team_id, away_team_id)
);

-- One row per shooter per match: the 7 individual shots plus derived totals.
create table if not exists public.score (
    id         uuid primary key default gen_random_uuid(),
    match_id   uuid not null references public.match(id) on delete cascade,
    shooter_id uuid not null references public.shooter(id) on delete cascade,
    team_id    uuid not null references public.team(id),
    shots      integer[] not null default '{}',  -- e.g. {9,10,8,7,10,9,10}
    total      integer not null default 0 check (total >= 0),
    tens       integer not null default 0 check (tens >= 0),
    unique (match_id, shooter_id)
);

-- Links auth.users (logins) to a committee role + optional team.
create table if not exists public.user_profile (
    id      uuid primary key references auth.users(id) on delete cascade,
    email   text,
    role    text not null check (role in ('captain','secretary','treasurer','admin')),
    team_id uuid references public.team(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

create index if not exists idx_shooter_team       on public.shooter(team_id);
create index if not exists idx_match_date          on public.match(match_date);
create index if not exists idx_match_home          on public.match(home_team_id);
create index if not exists idx_match_away          on public.match(away_team_id);
create index if not exists idx_score_match         on public.score(match_id);
create index if not exists idx_score_shooter       on public.score(shooter_id);
create index if not exists idx_score_team          on public.score(team_id);

-- ----------------------------------------------------------------------------
-- VIEWS  (exposed automatically through the PostgREST API)
-- ----------------------------------------------------------------------------

-- Per-shooter season aggregates (drives the League Table + Team page).
create or replace view public.shooter_stats as
select
    sh.id            as shooter_id,
    sh.name,
    sh.role,
    sh.team_id,
    t.name           as team_name,
    t.slug           as team_slug,
    t.venue          as team_venue,
    count(sc.id)     as matches_played,
    coalesce(max(sc.total), 0)              as best,
    coalesce(sum(sc.tens), 0)               as tens,
    coalesce(round(avg(sc.total), 1), 0)    as average
from public.shooter sh
join public.team  t  on t.id  = sh.team_id
left join public.score sc on sc.shooter_id = sh.id
group by sh.id, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue;
create view public.shooter_stats with (security_invoker = true) as
select
    sh.id            as shooter_id,

-- Flat fixture list with team names (drives the Fixtures page).
create or replace view public.fixture_list as
select
    m.id,
    m.match_date      as date,
    m.home_team_id,
    th.name           as home_team,
    m.away_team_id,
    ta.name           as away_team,
    coalesce(m.venue, th.venue) as venue,
    (m.away_team_id is null)     as is_bye
from public.match m
join public.team th on th.id = m.home_team_id
left join public.team ta on ta.id = m.away_team_id;

-- Full scorecard rows for a match (drives the Match page).
create or replace view public.match_scorecard as
select
    sc.match_id,
    m.match_date      as date,
    sc.team_id,
    t.name            as team_name,
    sc.shooter_id,
    sh.name           as shooter_name,
    sc.shots,
    sc.total,
    sc.tens
from public.score sc
join public.match   m  on m.id  = sc.match_id
join public.team    t  on t.id  = sc.team_id
join public.shooter sh on sh.id = sc.shooter_id;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Public can read everything; only committee editors can write.
-- ----------------------------------------------------------------------------

alter table public.team          enable row level security;
alter table public.shooter       enable row level security;
alter table public.match         enable row level security;
alter table public.score         enable row level security;
alter table public.season        enable row level security;
alter table public.user_profile  enable row level security;

-- Helper: is the current user a committee member who may edit data?
create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_profile p
        where p.id = auth.uid()
          and p.role in ('captain','secretary','treasurer','admin')
    );
$$;

-- ---- Read policies (public) ----
drop policy if exists "public read" on public.team;
create policy "public read" on public.team for select using (true);

drop policy if exists "public read" on public.shooter;
create policy "public read" on public.shooter for select using (true);

drop policy if exists "public read" on public.match;
create policy "public read" on public.match for select using (true);

drop policy if exists "public read" on public.score;
create policy "public read" on public.score for select using (true);

drop policy if exists "public read" on public.season;
create policy "public read" on public.season for select using (true);

drop policy if exists "public read" on public.user_profile;
create policy "public read" on public.user_profile for select using (true);

-- ---- Write policies (editors only) ----
drop policy if exists "editors manage teams" on public.team;
create policy "editors manage teams" on public.team
    for all using (public.is_editor()) with check (public.is_editor());

drop policy if exists "editors manage shooters" on public.shooter;
create policy "editors manage shooters" on public.shooter
    for all using (public.is_editor()) with check (public.is_editor());

drop policy if exists "editors manage matches" on public.match;
create policy "editors manage matches" on public.match
    for all using (public.is_editor()) with check (public.is_editor());

drop policy if exists "editors manage scores" on public.score;
create policy "editors manage scores" on public.score
    for all using (public.is_editor()) with check (public.is_editor());

drop policy if exists "editors manage seasons" on public.season;
create policy "editors manage seasons" on public.season
    for all using (public.is_editor()) with check (public.is_editor());

-- user_profile: editors manage rows; a user may read their own (covered by public read).
drop policy if exists "editors manage profiles" on public.user_profile;
create policy "editors manage profiles" on public.user_profile
    for all using (public.is_editor()) with check (public.is_editor());
