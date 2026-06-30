-- ============================================================================
-- NADARL Portal - Captain accounts & per-team editing permissions
-- Run this in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Roles after this migration (user_profile.role):
--   pending  - signed up, awaiting admin approval (cannot log in to editor)
--   generic  - per-team shared account; edits ONLY today's home match scores
--   captain  - edits today's home match scores + manages own team's shooters
--   admin    - full access to everything
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Migrate any legacy roles to the new scheme
-- ---------------------------------------------------------------------------
update public.user_profile set role = 'generic'
  where role in ('secretary', 'treasurer');

-- ---------------------------------------------------------------------------
-- 2. Replace the role check constraint with the new allowed values.
--    (requested_name/requested_role columns from an earlier draft are removed
--    if present.)
-- ---------------------------------------------------------------------------
alter table public.user_profile
    drop column if exists requested_name,
    drop column if exists requested_role;

alter table public.user_profile
    drop constraint if exists user_profile_role_check;

alter table public.user_profile
    add constraint user_profile_role_check
    check (role in ('pending', 'generic', 'captain', 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Helper SQL functions (all security definer so they bypass RLS safely)
-- ---------------------------------------------------------------------------

-- The "league day", resolved in UK local time so match_date lines up with
-- when the matches are actually shot.
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

-- Is the current user a team member who may edit scores for an ONGOING match?
-- An ongoing match = match_date is today AND the user's team is the home side.
-- Captain AND generic accounts both qualify (differ only on shooter editing).
create or replace function public.can_edit_ongoing_match_scores()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_profile p
        join public.match m on m.home_team_id = p.team_id
        where p.id = auth.uid()
          and p.role in ('captain', 'generic')
          and m.match_date = public.league_today()
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Auto-create a 'pending' user_profile row whenever a new auth user is
--    added (e.g. via the Supabase Dashboard). Set role/team afterwards using
--    create-accounts.sql.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. Row Level Security - rewritten for per-team scoping
-- ---------------------------------------------------------------------------

-- ---- READ: everything stays public ---------------------------------------
-- (existing "public read" policies are retained; recreated here for safety)

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

-- ---- WRITE: team / match / season / user_profile -> admins only ---------

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

-- ---- WRITE: shooters -> admin (any team) OR captain (own team only) -----
drop policy if exists "editors manage shooters" on public.shooter;
drop policy if exists "manage shooters" on public.shooter;
create policy "manage shooters" on public.shooter
    for all
    using (
        public.is_admin()
        or (
            exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role = 'captain'
                  and p.team_id = shooter.team_id
            )
        )
    )
    with check (
        public.is_admin()
        or (
            exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role = 'captain'
                  and p.team_id = shooter.team_id
            )
        )
    );

-- ---- WRITE: scores -> admin (any) OR captain/generic for ongoing home match
drop policy if exists "editors manage scores" on public.score;
drop policy if exists "manage scores" on public.score;
create policy "manage scores" on public.score
    for all
    using (
        public.is_admin()
        or (
            -- the row belongs to my team...
            score.team_id = public.my_team_id()
            -- ...and the match it belongs to is today's home match for my team
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

commit;

-- ---------------------------------------------------------------------------
-- 5b. Grant API roles the privileges they need to read/write the tables.
--     Supabase grants SELECT by default but not writes on manually-created
--     tables, so this is required for the admin panel / captains to save.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete
    on all tables in schema public
    to anon, authenticated;

grant usage, select
    on all sequences in schema public
    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Bootstrap the first admin (optional, run once).
--    Replace the email with the league administrator's auth user email.
--    Their auth account must already exist (created via the Dashboard).
-- ---------------------------------------------------------------------------
-- update public.user_profile
--    set role = 'admin', team_id = null
--  where email = 'you@example.com';
