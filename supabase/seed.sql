-- ============================================================================
-- NADARL Portal - Seed data
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- Re-runnable: uses ON CONFLICT DO NOTHING so it won't duplicate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SEASON
-- ----------------------------------------------------------------------------
insert into public.season (name, start_date, end_date, is_current)
values ('2026-27', '2026-05-01', '2026-09-30', true)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- TEAMS
-- ----------------------------------------------------------------------------
insert into public.team (name, venue, slug)
values
    ('Belle Vue Rifles', 'Belle Vue', 'belle-vue-rifles'),
    ('Isca Rifles',      'Isca',      'isca-rifles'),
    ('Newport Eagles',   'Newport',   'newport-eagles'),
    ('Pantmawr Rifles',  'Pantmawr',  'pantmawr-rifles'),
    ('Rumney Rifles',    'Rumney',    'rumney-rifles')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- SHOOTERS  (first 3 of each team = captain / secretary / treasurer)
-- ----------------------------------------------------------------------------
insert into public.shooter (team_id, name, role)
select t.id, s.name, s.role
from (values
    ('Belle Vue Rifles','J. Thompson','captain'),
    ('Belle Vue Rifles','M. Richards','secretary'),
    ('Belle Vue Rifles','D. Williams','treasurer'),
    ('Belle Vue Rifles','A. Davies',  null),
    ('Belle Vue Rifles','R. Evans',   null),
    ('Belle Vue Rifles','S. Morgan',  null),
    ('Belle Vue Rifles','K. Hughes',  null),
    ('Belle Vue Rifles','P. Jones',   null),
    ('Belle Vue Rifles','L. Clarke',  null),

    ('Isca Rifles','T. Idris','captain'),
    ('Isca Rifles','V. Jones','secretary'),
    ('Isca Rifles','W. King','treasurer'),
    ('Isca Rifles','X. Lloyd', null),
    ('Isca Rifles','Y. Miles', null),
    ('Isca Rifles','Z. Newman',null),
    ('Isca Rifles','A. Owens', null),
    ('Isca Rifles','B. Price', null),
    ('Isca Rifles','C. Ross',  null),

    ('Newport Eagles','A. Adams','captain'),
    ('Newport Eagles','C. Baker','secretary'),
    ('Newport Eagles','E. Carter','treasurer'),
    ('Newport Eagles','G. Dixon', null),
    ('Newport Eagles','K. Ellis', null),
    ('Newport Eagles','M. Fox',   null),
    ('Newport Eagles','P. Green', null),
    ('Newport Eagles','S. Hart',  null),
    ('Newport Eagles','T. James', null),

    ('Pantmawr Rifles','G. Hopkins','captain'),
    ('Pantmawr Rifles','L. Bennett','secretary'),
    ('Pantmawr Rifles','C. Griffiths','treasurer'),
    ('Pantmawr Rifles','T. Edwards', null),
    ('Pantmawr Rifles','N. Powell',  null),
    ('Pantmawr Rifles','H. Morris',  null),
    ('Pantmawr Rifles','B. Clarke',  null),
    ('Pantmawr Rifles','W. Rees',    null),
    ('Pantmawr Rifles','F. Owen',    null),

    ('Rumney Rifles','F. Webb','captain'),
    ('Rumney Rifles','O. Perry','secretary'),
    ('Rumney Rifles','E. Cox','treasurer'),
    ('Rumney Rifles','I. Kelly',   null),
    ('Rumney Rifles','J. Russell', null),
    ('Rumney Rifles','M. Grant',   null),
    ('Rumney Rifles','D. Wallace', null),
    ('Rumney Rifles','R. Spencer', null),
    ('Rumney Rifles','A. Blake',   null)
) as s(team_name, name, role)
join public.team t on t.name = s.team_name
on conflict (team_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- FIXTURES  (NULL away_team_id = BYE week)
-- ----------------------------------------------------------------------------
insert into public.match (season_id, match_date, home_team_id, away_team_id, venue)
select
    (select id from public.season where name = '2026-27'),
    f.match_date::date,
    th.id,
    ta.id,                       -- null when BYE
    f.venue
from (values
    ('2026-05-27','Isca Rifles','Belle Vue Rifles','Isca'),
    ('2026-05-27','Pantmawr Rifles','Rumney Rifles','Pantmawr'),
    ('2026-05-27','Newport Eagles',null,null),                 -- BYE
    ('2026-05-28','Belle Vue Rifles','Pantmawr Rifles','Belle Vue'),
    ('2026-05-28','Rumney Rifles','Newport Eagles','Rumney'),
    ('2026-05-28','Isca Rifles',null,null),                    -- BYE
    ('2026-06-02','Newport Eagles','Isca Rifles','Newport'),
    ('2026-06-02','Belle Vue Rifles','Rumney Rifles','Belle Vue'),
    ('2026-06-02','Pantmawr Rifles',null,null),                -- BYE
    ('2026-06-09','Pantmawr Rifles','Newport Eagles','Pantmawr'),
    ('2026-06-09','Isca Rifles','Rumney Rifles','Isca'),
    ('2026-06-09','Belle Vue Rifles',null,null),               -- BYE
    ('2026-06-16','Belle Vue Rifles','Newport Eagles','Belle Vue'),
    ('2026-06-16','Rumney Rifles','Isca Rifles','Rumney'),
    ('2026-06-16','Pantmawr Rifles',null,null),                -- BYE
    ('2026-06-23','Pantmawr Rifles','Isca Rifles','Pantmawr'),
    ('2026-06-23','Newport Eagles','Rumney Rifles','Newport'),
    ('2026-06-23','Belle Vue Rifles',null,null)                -- BYE
) as f(match_date, home_team, away_team, venue)
join public.team th on th.name = f.home_team
left join public.team ta on ta.name = f.away_team
on conflict (match_date, home_team_id, away_team_id) do nothing;

-- ----------------------------------------------------------------------------
-- SCORES  (generated sample data for every played, non-BYE match)
--   7 shots per shooter, each 7..10. total + tens derived from the shots array.
-- ----------------------------------------------------------------------------
insert into public.score (match_id, shooter_id, team_id, shots, total, tens)
with generated as (
    select
        m.id        as match_id,
        sh.id       as shooter_id,
        sh.team_id,
        array(
            select (7 + floor(random() * 4))::int
            from generate_series(1, 7)
        ) as shots
    from public.match m
    join public.shooter sh
      on sh.team_id = m.home_team_id
      or sh.team_id = m.away_team_id
    where m.away_team_id is not null
)
select
    match_id,
    shooter_id,
    team_id,
    shots,
    (select sum(v) from unnest(shots) as v) as total,
    (select count(*) from unnest(shots) as v where v = 10) as tens
from generated
on conflict (match_id, shooter_id) do nothing;
