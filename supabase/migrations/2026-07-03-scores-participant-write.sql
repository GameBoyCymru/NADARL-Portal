-- Allow each team's captain/generic account to write their own score rows
-- for a match they participate in (home OR away), not only when hosting.
-- This lets the away team assign their shooters (lineup) for the match.
-- Entering actual shot scores is restricted to the home team in the UI;
-- the home team enters all scores for the night.

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
                  and m.match_date = public.league_today()
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
                  and m.match_date = public.league_today()
                  and (m.home_team_id = score.team_id or m.away_team_id = score.team_id)
            )
            and exists (
                select 1 from public.user_profile p
                where p.id = auth.uid()
                  and p.role in ('captain', 'generic')
            )
        )
    );
