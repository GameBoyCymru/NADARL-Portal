-- Lets the admin Exceptions/Competitions/Events managers keep the season's
-- match schedule contiguous: adding one of these calendar entries shifts
-- every match on/after its date forward a week (making room), deleting one
-- shifts every match after its date back a week (closing the gap it leaves).
--
-- Also adds updateExclusion support (exclusion.id-based update), needed so
-- the Exceptions admin panel can become a row-editable table like
-- Competitions/Events instead of its old add-only chip list.

create or replace function public.shift_season_fixtures(
    p_season_id   uuid,
    p_cutoff_date date,
    p_delta_days  integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    -- Big enough that no real fixture date could ever collide with it, but
    -- small enough to stay within the `date` type's range.
    v_temp_offset constant integer := 1000000;
begin
    if not public.is_admin() then
        raise exception 'Only admins can shift fixture dates.';
    end if;
    if p_delta_days = 0 then
        return;
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
       and match_date >= p_cutoff_date;

    update public.match
       set match_date = match_date + (p_delta_days - v_temp_offset)
     where season_id = p_season_id
       and match_date >= p_cutoff_date + v_temp_offset;
end;
$$;

grant execute on function public.shift_season_fixtures(uuid, date, integer) to anon, authenticated;
