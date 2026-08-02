-- handicap_config was created in 2026-07-04-handicap.sql, after the
-- blanket "grant select, insert, update, delete on all tables in schema
-- public" in 2026-06-29-captains-and-permissions.sql had already run -
-- Postgres grants on "all tables" only apply to tables that existed at the
-- time, not ones created later. That migration only granted SELECT on
-- handicap_config, so admins hit "permission denied for table
-- handicap_config" trying to save the formula: the RLS policy
-- ("admin manages handicap config") was correctly allowing it, but the
-- base table privilege was missing entirely, which Postgres checks first.

grant insert, update, delete on public.handicap_config to anon, authenticated;
