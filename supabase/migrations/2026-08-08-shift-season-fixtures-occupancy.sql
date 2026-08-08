-- Fixes shift_season_fixtures (2026-08-08-shift-season-fixtures.sql): it was
-- blanket-shifting every fixture in the season on/after the cutoff date,
-- even when nothing actually collided with the exception/competition/event
-- being added, moved, or removed. It should only move fixtures that are
-- actually in the way, and only as far as needed to clear a genuinely free
-- week - not the whole rest of the season.
--
-- New behaviour, both driven by whether a week is actually occupied:
--   p_delta_days > 0 (making room at p_start_date): walks forward from
--     p_start_date while each weekly slot has a match, and shifts that
--     whole contiguous occupied run forward by p_delta_days. If
--     p_start_date itself has no match, this is a no-op.
--   p_delta_days < 0 (closing the gap left at p_start_date): walks forward
--     from the *next* slot (p_start_date - p_delta_days, i.e. one delta
--     later) while occupied, and pulls that whole contiguous run back by
--     p_delta_days. If the next slot has no match, this is a no-op - there's
--     nothing to pull into the freed date.
-- Now returns the number of fixtures actually moved, so callers can tell
-- the admin whether anything really shifted instead of always claiming it
-- did. Return type changed (void -> integer), so the function must be
-- dropped before it can be recreated.

drop function if exists public.shift_season_fixtures(uuid, date, integer);

create function public.shift_season_fixtures(
    p_season_id   uuid,
    p_start_date  date,
    p_delta_days  integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    -- Big enough that no real fixture date could ever collide with it, but
    -- small enough to stay within the `date` type's range.
    v_temp_offset constant integer := 1000000;
    v_scan  date;
    v_start date;
    v_end   date;
    v_moved integer;
begin
    if not public.is_admin() then
        raise exception 'Only admins can shift fixture dates.';
    end if;
    if p_delta_days = 0 then
        return 0;
    end if;

    if p_delta_days > 0 then
        -- Making room: find the contiguous run of occupied weekly slots
        -- starting at p_start_date, stopping at the first free week.
        v_start := p_start_date;
        v_scan := p_start_date;
        while exists (
            select 1 from public.match
             where season_id = p_season_id and match_date = v_scan
        ) loop
            v_scan := v_scan + p_delta_days;
        end loop;
        v_end := v_scan; -- exclusive upper bound of the occupied run

        if v_end = v_start then
            return 0; -- p_start_date itself is free - nothing to shift
        end if;
    else
        -- Closing a gap: the slot right after p_start_date is the first
        -- candidate to pull back. If it's free, there's nothing to pull in.
        v_start := p_start_date - p_delta_days; -- p_delta_days is negative
        if not exists (
            select 1 from public.match
             where season_id = p_season_id and match_date = v_start
        ) then
            return 0;
        end if;

        v_scan := v_start;
        while exists (
            select 1 from public.match
             where season_id = p_season_id and match_date = v_scan
        ) loop
            v_scan := v_scan - p_delta_days; -- delta negative -> scans forward
        end loop;
        v_end := v_scan; -- exclusive upper bound of the occupied run
    end if;

    -- Two-phase move: shifting every targeted row by the same delta in one
    -- statement can still trip the (match_date, home_team_id, away_team_id)
    -- unique constraint mid-statement, because Postgres checks it as each
    -- row is written, before sibling rows in the same UPDATE have moved out
    -- of the way. Move everything far into the future first (where nothing
    -- else can possibly collide), then from there to its real destination.
    update public.match
       set match_date = match_date + v_temp_offset
     where season_id = p_season_id
       and match_date >= v_start and match_date < v_end;

    update public.match
       set match_date = match_date + (p_delta_days - v_temp_offset)
     where season_id = p_season_id
       and match_date >= v_start + v_temp_offset and match_date < v_end + v_temp_offset;
    get diagnostics v_moved = row_count;

    return v_moved;
end;
$$;

grant execute on function public.shift_season_fixtures(uuid, date, integer) to anon, authenticated;
