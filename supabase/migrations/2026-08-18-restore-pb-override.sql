-- Reinstates the admin-editable Personal Best override that
-- 2026-08-08-remove-manual-pb-override.sql deliberately revoked. Requested
-- again for backfilling pre-digital-records history / correcting bad data,
-- with the explicit tradeoff (silent regression risk on season reset, etc.)
-- accepted this time.
--
-- Re-uses the existing shooter_season_best table/ratchet-trigger design from
-- 2026-08-08-shooter-season-best.sql rather than reviving the separate
-- shooter.personal_best column from the very first (2026-08-07) attempt -
-- that column had to coexist with captains' ordinary name/role writes on
-- the same row (hence a column-level guard trigger there), which
-- shooter_season_best's own admin-only-RLS table never needed. Editing
-- either Season Best or all-time Personal Best is the same operation: set
-- the override for a given (shooter, season); all-time best is already
-- derived as the max override across every season, so raising any one
-- season's value can raise the all-time figure too.

grant insert, update, delete on public.shooter_season_best to anon, authenticated;

drop policy if exists "admin manages shooter season best" on public.shooter_season_best;
create policy "admin manages shooter season best" on public.shooter_season_best
    for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - bring back season_best_override so the Team
-- page editor can show/edit the admin-set value directly (distinct from
-- season_best, which is greatest(override, computed)).
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
    season_best_override integer,
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
        ssb_cur.personal_best as season_best_override,
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
-- shooter_stats view (current season only) - same treatment.
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
    ssb_cur.personal_best as season_best_override,
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
