-- Unconfirm (per side) and reset (both sides) for the confirmation flow.
-- These run alongside the confirm/submit functions. No today-check so they
-- work while the test-disable-today-check migration is applied.

create or replace function public.unconfirm_match_side(p_match uuid, p_side text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    m      public.match%rowtype;
    v_role text;
    v_team uuid;
begin
    select role, team_id into v_role, v_team
    from public.user_profile where id = auth.uid();
    if not found then return false; end if;

    select * into m from public.match where id = p_match;
    if not found then return false; end if;
    if m.submitted then return false; end if;

    if v_role = 'admin' then
        null;
    elsif v_role in ('captain', 'generic') then
        if p_side = 'home' and v_team = m.home_team_id then null;
        elsif p_side = 'away' and v_team = m.away_team_id then null;
        else return false; end if;
    else
        return false;
    end if;

    if p_side = 'home' then
        update public.match set home_confirmed = false where id = p_match;
    elsif p_side = 'away' then
        update public.match set away_confirmed = false where id = p_match;
    else
        return false;
    end if;

    return true;
end;
$$;

-- Reset both confirmations (used when scores are edited after confirming).
-- Callable by any team participating in the match or an admin.
create or replace function public.reset_match_confirm(p_match uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    m      public.match%rowtype;
    v_role text;
    v_team uuid;
begin
    select role, team_id into v_role, v_team
    from public.user_profile where id = auth.uid();
    if not found then return false; end if;

    select * into m from public.match where id = p_match;
    if not found then return false; end if;
    if m.submitted then return true; end if;

    if v_role = 'admin' then null;
    elsif v_role in ('captain', 'generic')
          and (v_team = m.home_team_id or v_team = m.away_team_id) then null;
    else return false; end if;

    update public.match
        set home_confirmed = false, away_confirmed = false
        where id = p_match;
    return true;
end;
$$;

grant execute on function public.unconfirm_match_side(uuid, text) to anon, authenticated;
grant execute on function public.reset_match_confirm(uuid) to anon, authenticated;
