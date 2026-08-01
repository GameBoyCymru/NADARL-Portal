-- Handicaps should only kick in once a shooter has some current-season form
-- to base them on. Previously shooter_handicap() used the shooter's last 3
-- submitted matches ever, so a shooter with e.g. one match this season (but
-- history from prior seasons) already got a non-zero handicap. Now it only
-- looks at matches within the season covering the reference date, and
-- requires at least 3 of them before a handicap is granted (0 otherwise).

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
    ref as (
        select coalesce(p_before, current_date) as d
    ),
    active_season as (
        select s.id as season_id
        from public.season s, ref
        order by
            case when s.start_date <= ref.d and s.end_date >= ref.d then 0 else 1 end,
            case when s.is_current then 0 else 1 end,
            s.start_date desc nulls last
        limit 1
    ),
    recent as (
        select sc.total
        from public.score sc
        join public.match m on m.id = sc.match_id
        where sc.shooter_id = p_shooter
          and m.submitted
          and (p_before is null or m.match_date < p_before)
          and m.season_id = (select season_id from active_season)
        order by m.match_date desc, sc.id desc
        limit 3
    )
    select case
        when (select count(*) from recent) < 3 then 0
        else greatest(0, round(((select target from cfg) - avg(total)) * (select factor from cfg)))
    end
    from recent;
$$;
