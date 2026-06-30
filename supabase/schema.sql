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
    id          uuid primary key default gen_random_uuid(),
    shooter_no  integer unique,                 -- league-wide sequential number (0001...), auto-assigned
    team_id     uuid not null references public.team(id) on delete cascade,
    name        text not null,                     -- e.g. 'J. Thompson'
    role        text check (role in ('captain','secretary','treasurer')),
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

-- Links auth.users (logins) to a role + optional team.
--   pending  - signed up, awaiting admin approval
--   generic  - per-team shared account; edits today's home-match scores
--   captain  - edits today's home-match scores + manages own team's shooters
--   admin    - full access
create table if not exists public.user_profile (
    id             uuid primary key references auth.users(id) on delete cascade,
    email          text,
    role           text not null check (role in ('pending','generic','captain','admin')),
    team_id        uuid references public.team(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------

create index if not exists idx_shooter_team       on public.shooter(team_id);

-- League-wide sequential shooter number (0001...). Auto-assigned on insert.
create sequence if not exists public.shooter_no_seq as integer start with 1;

create or replace function public.assign_shooter_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.shooter_no is null then
        new.shooter_no := nextval('public.shooter_no_seq');
    end if;
    return new;
end;
$$;

drop trigger if exists trg_shooter_no on public.shooter;
create trigger trg_shooter_no
    before insert on public.shooter
    for each row execute function public.assign_shooter_no();
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
create or replace view public.shooter_stats with (security_invoker = true) as
select
    sh.id            as shooter_id,
    sh.shooter_no,
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
group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue;

-- Flat fixture list with team names (drives the Fixtures page).
create or replace view public.fixture_list with (security_invoker = true) as
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
create or replace view public.match_scorecard with (security_invoker = true) as
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
-- Public can read everything. Writes are scoped:
--   admin    -> everything
--   captain  -> own team's shooters + today's home-match scores
--   generic  -> today's home-match scores only
-- ----------------------------------------------------------------------------

alter table public.team          enable row level security;
alter table public.shooter       enable row level security;
alter table public.match         enable row level security;
alter table public.score         enable row level security;
alter table public.season        enable row level security;
alter table public.user_profile  enable row level security;

-- The "league day", resolved in UK local time.
create or replace function public.league_today()
returns date
language sql
stable
set search_path = public
as $$
    select (now() at time zone 'Europe/London')::date;
$$;

-- team_id of the currently signed-in user (or null).
create or replace function public.my_team_id()
returns uuid
language sql
security definer
set search_path = public
as $$
    select team_id from public.user_profile where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_profile p
        where p.id = auth.uid() and p.role = 'admin'
    );
$$;

-- Auto-create a 'pending' profile for any new auth user (e.g. when you add a
-- user in the Supabase Dashboard). Set their role/team with create-accounts.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_profile (id, email, role, team_id)
    values (new.id, new.email, 'pending', null)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

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

-- ---- Write policies ----

-- team / match / season / user_profile -> admins only
drop policy if exists "editors manage teams" on public.team;
drop policy if exists "admin manages teams" on public.team;
create policy "admin manages teams" on public.team
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "editors manage matches" on public.match;
drop policy if exists "admin manages matches" on public.match;
create policy "admin manages matches" on public.match
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "editors manage seasons" on public.season;
drop policy if exists "admin manages seasons" on public.season;
create policy "admin manages seasons" on public.season
    for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "editors manage profiles" on public.user_profile;
drop policy if exists "admin manages profiles" on public.user_profile;
create policy "admin manages profiles" on public.user_profile
    for all using (public.is_admin()) with check (public.is_admin());

-- shooters -> admin (any) OR captain (own team only)
drop policy if exists "editors manage shooters" on public.shooter;
drop policy if exists "manage shooters" on public.shooter;
create policy "manage shooters" on public.shooter
    for all
    using (
        public.is_admin()
        or exists (
            select 1 from public.user_profile p
            where p.id = auth.uid()
              and p.role = 'captain'
              and p.team_id = shooter.team_id
        )
    )
    with check (
        public.is_admin()
        or exists (
            select 1 from public.user_profile p
            where p.id = auth.uid()
              and p.role = 'captain'
              and p.team_id = shooter.team_id
        )
    );

-- scores -> admin (any) OR captain/generic for today's home match
drop policy if exists "editors manage scores" on public.score;
drop policy if exists "manage scores" on public.score;
create policy "manage scores" on public.score
    for all
    using (
        public.is_admin()
        or (
            score.team_id = public.my_team_id()
            and exists (
                select 1 from public.match m
                where m.id = score.match_id
                  and m.match_date = public.league_today()
                  and m.home_team_id = score.team_id
            )
            and exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role in ('captain', 'generic')
            )
        )
    )
    with check (
        public.is_admin()
        or (
            score.team_id = public.my_team_id()
            and exists (
                select 1 from public.match m
                where m.id = score.match_id
                  and m.match_date = public.league_today()
                  and m.home_team_id = score.team_id
            )
            and exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role in ('captain', 'generic')
            )
        )
    );

-- ----------------------------------------------------------------------------
-- GRANTS - Supabase grants SELECT by default but not writes on
-- manually-created tables, so write privileges must be granted explicitly
-- to the anon / authenticated API roles.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete
    on all tables in schema public
    to anon, authenticated;

grant usage, select
    on all sequences in schema public
    to anon, authenticated;
