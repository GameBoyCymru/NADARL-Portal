-- ============================================================================
-- NADARL Portal - Short shooter numbers (league-wide sequence)
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds a memorable, league-wide sequential number to each shooter (0001, 0002,
-- ...) shown zero-padded in the UI. The existing UUID stays as the internal key.
-- Captains never set this number - it is auto-assigned on insert.
-- ============================================================================

-- 1. Sequence + column
create sequence if not exists public.shooter_no_seq as integer start with 1 increment by 1;

alter table public.shooter
    add column if not exists shooter_no integer;

-- unique number across the whole league (multiple NULLs allowed until backfilled)
create unique index if not exists shooter_shooter_no_key
    on public.shooter (shooter_no);

-- 2. Backfill existing shooters in name order
update public.shooter s
   set shooter_no = n.rn
  from (
      select id, row_number() over (order by team_id, name) + 0 as rn
      from public.shooter
  ) n
 where s.id = n.id
   and s.shooter_no is null;

-- advance the sequence past any backfilled values so the next insert continues
do $$
declare max_no integer;
begin
  select coalesce(max(shooter_no), 0) into max_no from public.shooter;
  perform setval('public.shooter_no_seq', greatest(max_no, 1), max_no > 0);
end $$;

-- 3. Auto-assign shooter_no on insert (captains don't pass it)
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

-- 4. Expose shooter_no through the shooter_stats view
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

-- 5. Grants (in case write privileges were not yet granted on the shooter table)
grant select, insert, update, delete on public.shooter to anon, authenticated;
grant usage, select on public.shooter_no_seq to anon, authenticated;
