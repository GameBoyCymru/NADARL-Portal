-- ============================================================================
-- NADARL Portal - Create / assign accounts
-- ============================================================================
-- HOW TO USE
--   1. Create the user in Supabase: Dashboard > Authentication > Users > Add user
--      (set their email + password there). This auto creates a 'pending'
--      profile row thanks to the handle_new_user trigger.
--   2. Edit the list below to set each account's TEAM and ROLE.
--   3. Run this whole script in the Supabase SQL Editor.
--
-- ROLES
--   captain  - edits today's home-match scores + manages their own team's shooters
--   generic  - shared team account; edits today's home-match scores only
--   admin    - full access to everything (leave team blank)
--   pending  - cannot log in (default for brand-new accounts)
--
-- This is safe to re-run: it updates existing accounts in place.
-- ============================================================================

insert into public.user_profile (id, email, role, team_id)
select
    u.id,
    u.email,
    x.role,
    t.id                       -- null when team is left blank -> use null
from (values

    -- A team captain (manages shooters + today's home-match scores):
    -- ( email,                              role,       team_name )
      ('captain@bellevue.example.com',      'captain',  'Belle Vue Rifles'),
      ('captain@isca.example.com',          'captain',  'Isca Rifles'),
      ('captain@newport-eagles.example.com','captain',  'Newport Eagles'),
      ('captain@pantmawr.example.com',      'captain',  'Pantmawr Rifles'),
      ('captain@rumney.example.com',        'captain',  'Rumney Rifles')

    -- A shared team account (today's home-match scores only, no shooter editing):
    -- ('team@example.com',             'generic',  'Team Name')

    -- Admin (league-wide, no team):
    -- ('admin@example.com',                   'admin',    null)

) as x(email, role, team_name)
left join auth.users  u on u.email = x.email
left join public.team t on t.name  = x.team_name
on conflict (id) do update
    set role    = excluded.role,
        team_id = excluded.team_id,
        email   = excluded.email;

-- Quick sanity check - what do the accounts look like now?
select p.email, p.role, t.name as team
from public.user_profile p
left join public.team t on t.id = p.team_id
order by p.role, p.email;
