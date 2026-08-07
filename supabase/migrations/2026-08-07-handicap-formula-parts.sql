-- Expand the handicap formula from  max(0, round((target - avg) * factor))
-- to a 4-part editable formula:
--   max(0, round((((target - avg) / divisor) - offset_value) * factor))
-- so admins can tune every step from the admin panel. Also seeds the config
-- with the specific formula requested: (((70 - avg) / 2) - 0.95) * 1.4.

alter table public.handicap_config
    add column if not exists divisor      numeric not null default 2,
    add column if not exists offset_value numeric not null default 0.95;

update public.handicap_config
   set target = 70, divisor = 2, offset_value = 0.95, factor = 1.4
 where id = 1;

create or replace function public.shooter_handicap(p_shooter uuid, p_before date default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    with cfg as (
        select target, divisor, offset_value, factor
        from public.handicap_config where id = 1 limit 1
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
        when (select count(*) from recent) < 3 then null
        else greatest(0, round((
            ((select target from cfg) - avg(total)) / nullif((select divisor from cfg), 0)
            - (select offset_value from cfg)
        ) * (select factor from cfg)))
    end
    from recent;
$$;
