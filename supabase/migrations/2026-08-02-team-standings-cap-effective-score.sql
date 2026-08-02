-- A card is 7 shots at a max of 10 each, so no handicap should ever push a
-- shooter's effective score past 70 - mirrors the effectiveScore() cap added
-- to JS/match.js. Only the "scored" CTE changes (cap each shooter's
-- handicap-adjusted score before it's ranked/summed into the A/B totals).

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
        select m.id, m.half, m.home_team_id, m.away_team_id, m.match_date
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
    match_results as (
        select p.id as match_id, p.half, 'A' as league,
               p.home_team_id, ht.a_total as home_total,
               p.away_team_id, at.a_total as away_total
        from played p
        join team_totals ht on ht.match_id = p.id and ht.team_id = p.home_team_id
        join team_totals at on at.match_id = p.id and at.team_id = p.away_team_id
        union all
        select p.id, p.half, 'B',
               p.home_team_id, ht.b_total,
               p.away_team_id, at.b_total
        from played p
        join team_totals ht on ht.match_id = p.id and ht.team_id = p.home_team_id
        join team_totals at on at.match_id = p.id and at.team_id = p.away_team_id
    ),
    per_team as (
        select match_id, half, league, home_team_id as team_id, home_total as team_total, away_total as opp_total
        from match_results
        union all
        select match_id, half, league, away_team_id as team_id, away_total as team_total, home_total as opp_total
        from match_results
    )
    select
        t.id as team_id,
        t.name as team_name,
        t.slug as team_slug,
        pt.half,
        pt.league,
        count(*) as matches_played,
        count(*) filter (where pt.team_total > pt.opp_total) as wins,
        count(*) filter (where pt.team_total = pt.opp_total) as draws,
        count(*) filter (where pt.team_total < pt.opp_total) as losses,
        (count(*) filter (where pt.team_total > pt.opp_total) * 2
            + count(*) filter (where pt.team_total = pt.opp_total) * 1) as points,
        round(avg(pt.team_total), 1) as average
    from per_team pt
    join public.team t on t.id = pt.team_id
    group by t.id, t.name, t.slug, pt.half, pt.league;
$$;

grant execute on function public.team_league_standings(uuid) to anon, authenticated;
