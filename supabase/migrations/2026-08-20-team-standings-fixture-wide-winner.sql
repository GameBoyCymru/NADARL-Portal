-- Per the league rules, a team's win/draw/loss on a fixture night is decided
-- by comparing its score against every other team that shot in the same
-- league that night (same match_date + half), not just the team it happened
-- to be paired against. Previously each match row (home vs away) was scored
-- as an isolated head-to-head, so on a night with 3+ teams shooting, a team
-- could out-score everyone and still only register a "win" against its own
-- paired opponent, while a team with the night's lowest score could still
-- register a "win" against a weaker paired opponent.
--
-- Now: for each (match_date, half, league) group, the team(s) with the
-- highest total win; if more than one team ties for the top score it's a
-- draw for those teams; everyone else in that group loses. On a normal
-- two-team fixture night this is equivalent to the old head-to-head result.

create or replace function public.team_league_standings(p_season_id uuid)
returns table (
    team_id        uuid,
    team_name      text,
    team_slug      text,
    half           smallint,
    league         text,      -- 'A' or 'B'
    matches_played bigint,
    wins           bigint,
    draws          bigint,
    losses         bigint,
    points         bigint,
    average        numeric
)
language sql
stable
security definer
set search_path = public
as $$
    with played as (
        select m.id, m.half, m.match_date, m.home_team_id, m.away_team_id
        from public.match m
        where m.season_id = p_season_id
          and m.submitted
          and m.away_team_id is not null
    ),
    scored as (
        select
            sc.match_id,
            sc.team_id,
            least(70, sc.total
              + case when p.half = 2
                     then coalesce(public.shooter_handicap(sc.shooter_id, p.match_date), 0)
                     else 0
                end) as effective
        from public.score sc
        join played p on p.id = sc.match_id
    ),
    ranked as (
        select
            match_id, team_id, effective,
            row_number() over (partition by match_id, team_id order by effective desc) as rnk
        from scored
    ),
    team_totals as (
        select
            match_id, team_id,
            coalesce(sum(effective) filter (where rnk <= 5), 0) as a_total,
            coalesce(sum(effective) filter (where rnk between 5 and 7), 0) as b_total
        from ranked
        group by match_id, team_id
    ),
    -- One row per team per fixture night (match_date + half) it shot in,
    -- carrying its A-league and B-league totals for that night.
    night_teams as (
        select p.match_date, p.half, tt.team_id, tt.a_total, tt.b_total
        from team_totals tt
        join played p on p.id = tt.match_id
    ),
    night_max as (
        select match_date, half,
               max(a_total) as max_a,
               max(b_total) as max_b
        from night_teams
        group by match_date, half
    ),
    night_tie_counts as (
        select nt.match_date, nt.half,
               count(*) filter (where nt.a_total = nm.max_a) as a_tie_count,
               count(*) filter (where nt.b_total = nm.max_b) as b_tie_count
        from night_teams nt
        join night_max nm using (match_date, half)
        group by nt.match_date, nt.half
    ),
    per_team as (
        select nt.match_date, nt.half, 'A' as league, nt.team_id, nt.a_total as team_total,
               case
                   when nt.a_total = nm.max_a and tc.a_tie_count = 1 then 'win'
                   when nt.a_total = nm.max_a and tc.a_tie_count > 1 then 'draw'
                   else 'loss'
               end as result
        from night_teams nt
        join night_max nm using (match_date, half)
        join night_tie_counts tc using (match_date, half)
        union all
        select nt.match_date, nt.half, 'B', nt.team_id, nt.b_total,
               case
                   when nt.b_total = nm.max_b and tc.b_tie_count = 1 then 'win'
                   when nt.b_total = nm.max_b and tc.b_tie_count > 1 then 'draw'
                   else 'loss'
               end
        from night_teams nt
        join night_max nm using (match_date, half)
        join night_tie_counts tc using (match_date, half)
    )
    select
        t.id as team_id,
        t.name as team_name,
        t.slug as team_slug,
        pt.half,
        pt.league,
        count(*) as matches_played,
        count(*) filter (where pt.result = 'win') as wins,
        count(*) filter (where pt.result = 'draw') as draws,
        count(*) filter (where pt.result = 'loss') as losses,
        (count(*) filter (where pt.result = 'win') * 2
            + count(*) filter (where pt.result = 'draw') * 1) as points,
        round(avg(pt.team_total), 1) as average
    from per_team pt
    join public.team t on t.id = pt.team_id
    group by t.id, t.name, t.slug, pt.half, pt.league;
$$;

grant execute on function public.team_league_standings(uuid) to anon, authenticated;
