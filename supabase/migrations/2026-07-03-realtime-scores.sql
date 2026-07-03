-- Enable Supabase Realtime on the score table so anyone can live-view
-- match scorecards as they are being entered.
-- Safe to run multiple times.

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'score'
    ) then
        alter publication supabase_realtime add table public.score;
    end if;
end
$$;
