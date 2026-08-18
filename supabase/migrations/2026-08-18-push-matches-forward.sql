-- Lets an admin push one match's date, and every match scheduled on or
-- after it in the same season, forward by a delta (typically +7 days) -
-- a genuine cascade regardless of gaps in the schedule. Distinct from
-- shift_season_fixtures (2026-08-08-shift-season-fixtures-occupancy.sql),
-- which only moves a contiguous *occupied* run and stops at the first free
-- week - that's the right behaviour for "make room around this one entry",
-- but wrong for "push everything from here on out back a week". Matches
-- only - exclusions/competitions/events are not touched.

create function public.push_matches_forward(
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
    v_moved integer;
begin
    if not public.is_admin() then
        raise exception 'Only admins can shift fixture dates.';
    end if;
    if p_delta_days = 0 then
        return 0;
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
       and match_date >= p_start_date;

    update public.match
       set match_date = match_date + (p_delta_days - v_temp_offset)
     where season_id = p_season_id
       and match_date >= p_start_date + v_temp_offset;
    get diagnostics v_moved = row_count;

    return v_moved;
end;
$$;

grant execute on function public.push_matches_forward(uuid, date, integer) to anon, authenticated;
