-- Handicap system.
--   handicap = max(0, round((target - avg_of_last_3) * factor))
-- The admin sets `target` and `factor` on a single config row. The handicap is
-- based on each shooter's average over their last 3 submitted matches, and only
-- matters for second-half (half = 2) fixtures.

-- ----------------------------------------------------------------------------
-- CONFIG  (single row, id locked to 1)
-- ----------------------------------------------------------------------------
create table if not exists public.handicap_config (
    id      smallint primary key default 1 check (id = 1),
    target  numeric not null default 70,   -- e.g. a perfect 7-shot card
    factor  numeric not null default 1     -- 1 = full credit, 0.5 = half, etc.
);

insert into public.handicap_config (id, target, factor)
values (1, 70, 1)
on conflict (id) do nothing;

alter table public.handicap_config enable row level security;

drop policy if exists "public read" on public.handicap_config;
create policy "public read" on public.handicap_config
    for select using (true);

drop policy if exists "admin manages handicap config" on public.handicap_config;
create policy "admin manages handicap config" on public.handicap_config
    for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- FUNCTIONS
-- ----------------------------------------------------------------------------

-- Handicap for one shooter.
--   p_before : when given, only matches shot strictly before that date count
--              (used so a handicap match uses form coming INTO that match).
--              NULL = use every submitted match to date (the shooter's current form).
-- Based on the average of the last 3 qualifying matches. A shooter with no
-- history gets 0. The result is never negative.
create or replace function public.shooter_handicap(p_shooter uuid, p_before date default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    with cfg as (
        select target, factor from public.handicap_config where id = 1 limit 1
    ),
    recent as (
        select sc.total
        from public.score sc
        join public.match m on m.id = sc.match_id
        where sc.shooter_id = p_shooter
          and m.submitted
          and (p_before is null or m.match_date < p_before)
        order by m.match_date desc, sc.id desc
        limit 3
    )
    select case
        when not exists (select 1 from recent) then 0
        else greatest(0, round(((select target from cfg) - avg(total)) * (select factor from cfg)))
    end
    from recent;
$$;

-- Bulk lookup: handicaps for many shooters at once (drives the Match page).
create or replace function public.handicaps_for(p_before date, p_shooters uuid[])
returns table(shooter_id uuid, handicap numeric)
language sql
stable
security definer
set search_path = public
as $$
    select id as shooter_id, public.shooter_handicap(id, p_before) as handicap
    from unnest(p_shooters) as id;
$$;

-- ----------------------------------------------------------------------------
-- VIEW  (append a `handicap` column = the shooter's current form)
-- ----------------------------------------------------------------------------
create or replace view public.shooter_stats with (security_invoker = true) as
with cur as (
    select id as season_id from public.season where is_current limit 1
)
select
    sh.id            as shooter_id,
    sh.shooter_no,
    sh.name,
    sh.role,
    sh.team_id,
    t.name           as team_name,
    t.slug           as team_slug,
    t.venue          as team_venue,
    coalesce(count(sc.id) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as matches_played,
    coalesce(max(sc.total) filter (where m.submitted), 0)                          as best,
    coalesce(max(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null)                                           as handicap
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id;

-- ----------------------------------------------------------------------------
-- GRANTS
-- ----------------------------------------------------------------------------
grant select on public.handicap_config to anon, authenticated;
grant execute on function public.shooter_handicap(uuid, date) to anon, authenticated;
grant execute on function public.handicaps_for(date, uuid[]) to anon, authenticated;
