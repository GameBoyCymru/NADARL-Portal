-- Supabase's security linter flags every SECURITY DEFINER function that
-- anon/authenticated can call via PostgREST RPC (/rest/v1/rpc/<name>),
-- including these three, which are trigger functions only - they read NEW/
-- OLD (only ever set by a real trigger firing) and were never meant to be
-- invoked directly. Nothing in the app calls them via .rpc(), and revoking
-- direct EXECUTE doesn't affect the triggers themselves: a trigger always
-- runs as its function's owner (that's what SECURITY DEFINER means), not as
-- whichever role's action fired it, so it needs no grant on anon/
-- authenticated to keep working.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.ratchet_season_best_from_match() from anon, authenticated;
revoke execute on function public.ratchet_season_best_from_score() from anon, authenticated;
