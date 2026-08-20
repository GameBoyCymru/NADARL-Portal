-- Captures two objects that existed live in the database (created directly
-- via the SQL Editor/dashboard at some point) but were never added to a
-- migration, so a disaster-recovery restore from this repo alone would have
-- silently lost them. Both were investigated after a Supabase security
-- linter flagged them as SECURITY DEFINER functions callable by anon/
-- authenticated - both are safe:
--   * is_editor() is a plain read-only role check (same pattern as
--     is_admin()), though it isn't currently referenced by any RLS policy
--     or app code, and checks role values ('secretary','treasurer') that
--     predate the current admin/captain/generic role model - kept as-is
--     rather than dropped, since removing it isn't a security fix.
--   * rls_auto_enable() is an event trigger function - Postgres only ever
--     invokes it automatically when a CREATE TABLE/CREATE TABLE AS/SELECT
--     INTO fires in this database, so despite being SECURITY DEFINER it was
--     never actually reachable via PostgREST RPC the way the linter's
--     generic warning implies.

create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
    select exists (
        select 1 from public.user_profile p
        where p.id = auth.uid()
          and p.role in ('captain','secretary','treasurer','admin')
    );
$function$;

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
    on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    execute function public.rls_auto_enable();

-- Not directly RPC-reachable (Postgres only invokes event trigger functions
-- for their registered DDL event), but revoked anyway for least-privilege
-- consistency with the other trigger-only functions in
-- 2026-08-20-revoke-trigger-function-execute.sql.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
