-- Removes the manual admin override for Personal Best entirely. Season Best
-- (and therefore the all-time Personal Best derived from it - see
-- 2026-08-08-personal-best-derived-from-season.sql) is now purely computed
-- from real submitted matches via the ratchet triggers in
-- 2026-08-08-shooter-season-best.sql. There is no longer any legitimate
-- direct write path to shooter_season_best from a client, admin or
-- otherwise - only the SECURITY DEFINER ratchet trigger functions write to
-- it (they run as the function owner, which bypasses RLS regardless of the
-- grants below).

revoke insert, update, delete on public.shooter_season_best from anon, authenticated;

drop policy if exists "admin manages shooter season best" on public.shooter_season_best;

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - drop the now-meaningless season_best_override
-- output column (nothing sets it manually anymore). Changing the return
-- table shape requires dropping the function first.
-- ----------------------------------------------------------------------------
drop function if exists public.shooter_stats_for_season(uuid);

create function public.shooter_stats_for_season(p_season_id uuid)
returns table (
    shooter_id           uuid,
    shooter_no           integer,
    name                 text,
    role                 text,
    team_id              uuid,
    team_name            text,
    team_slug            text,
    team_venue           text,
    matches_played       bigint,
    best                 integer,
    season_best          integer,
    tens                 bigint,
    average              numeric,
    handicap             numeric,
    total_matches_played bigint
)
language sql
stable
security definer
set search_path = public
as $$
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
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as matches_played,
        greatest(
            coalesce((
                select max(ssb.personal_best)
                from public.shooter_season_best ssb
                where ssb.shooter_id = sh.id
            ), 0),
            coalesce(max(sc.total) filter (where m.submitted), 0)
        )                                                                              as best,
        greatest(
            coalesce(ssb_cur.personal_best, 0),
            coalesce(max(sc.total) filter (
                where m.submitted and m.season_id = p_season_id
            ), 0)
        )                                                                              as season_best,
        coalesce(sum(sc.tens) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as tens,
        coalesce(round(avg(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 1), 0)                                                                      as average,
        public.shooter_handicap(sh.id, null::date)                                     as handicap,
        coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played
    from public.shooter sh
    join public.team   t   on t.id  = sh.team_id
    left join public.score sc on sc.shooter_id = sh.id
    left join public.match  m  on m.id = sc.match_id
    left join public.shooter_season_best ssb_cur
           on ssb_cur.shooter_id = sh.id and ssb_cur.season_id = p_season_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue, ssb_cur.personal_best
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- shooter_stats view - same treatment. Dropping season_best_override from
-- the output requires a full drop + recreate (CREATE OR REPLACE VIEW can
-- only append columns), so its grant needs reissuing too.
-- ----------------------------------------------------------------------------
drop view if exists public.shooter_stats;

create view public.shooter_stats with (security_invoker = true) as
with cur as (
    select id as season_id
    from public.season
    order by
        case when start_date <= current_date and end_date >= current_date then 0 else 1 end,
        case when is_current then 0 else 1 end,
        start_date desc nulls last
    limit 1
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
    greatest(
        coalesce((
            select max(ssb.personal_best)
            from public.shooter_season_best ssb
            where ssb.shooter_id = sh.id
        ), 0),
        coalesce(max(sc.total) filter (where m.submitted), 0)
    )                                                                              as best,
    greatest(
        coalesce(ssb_cur.personal_best, 0),
        coalesce(max(sc.total) filter (
            where m.submitted and m.season_id = cur.season_id
        ), 0)
    )                                                                              as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null::date)                                     as handicap,
    coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
left join public.shooter_season_best ssb_cur
       on ssb_cur.shooter_id = sh.id and ssb_cur.season_id = cur.season_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id, ssb_cur.personal_best;

grant select on public.shooter_stats to anon, authenticated;
