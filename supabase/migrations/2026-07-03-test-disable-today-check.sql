-- TEST ONLY: disable the "match must be today" check so generic/captain
-- accounts can edit/confirm/submit any match for testing.
-- Revert by re-applying the original policies/functions once testing is done.

-- 1) Score RLS: allow a team's captain/generic to write their own rows for
--    any match they participate in (no date restriction).
drop policy if exists "manage scores" on public.score;
create policy "manage scores" on public.score
    for all
    using (
        public.is_admin()
        or (
            score.team_id = public.my_team_id()
            and exists (
                select 1 from public.match m
                where m.id = score.match_id
                  and (m.home_team_id = score.team_id or m.away_team_id = score.team_id)
            )
            and exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role in ('captain', 'generic')
            )
        )
    )
    with check (
        public.is_admin()
        or (
            score.team_id = public.my_team_id()
            and exists (
                select 1 from public.match m
                where m.id = score.match_id
                  and (m.home_team_id = score.team_id or m.away_team_id = score.team_id)
            )
            and exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role in ('captain', 'generic')
            )
        )
    );

-- 2) Confirm: drop the match_date = today requirement.
create or replace function public.confirm_match_side(p_match uuid, p_side text)
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
        update public.match set home_confirmed = true where id = p_match;
    elsif p_side = 'away' then
        update public.match set away_confirmed = true where id = p_match;
    else
        return false;
    end if;

    return true;
end;
$$;

-- 3) Submit: drop the match_date = today requirement.
create or replace function public.submit_match(p_match uuid)
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
    if not (m.home_confirmed and m.away_confirmed) then return false; end if;
    if m.submitted then return true; end if;

    if v_role = 'admin' then null;
    elsif v_role in ('captain', 'generic') and v_team = m.home_team_id then null;
    else return false; end if;

    update public.match set submitted = true where id = p_match;
    return true;
end;
$$;

grant execute on function public.confirm_match_side(uuid, text) to anon, authenticated;
grant execute on function public.submit_match(uuid) to anon, authenticated;
