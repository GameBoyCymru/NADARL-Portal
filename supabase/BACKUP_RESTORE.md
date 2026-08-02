# Backup & Disaster Recovery

The NADARL Portal has no server of its own — it's a static site talking
directly to a Supabase (Postgres) project. That means there are two
independent layers of backup, and they cover different things:

| | Covers | How | Who |
| --- | --- | --- | --- |
| **This document** | Full Postgres: tables, data, views, functions, RLS policies | `pg_dump` / `pg_restore` from a terminal | Whoever holds the DB connection string |
| **Admin panel → Data Backup & Restore** | Table *data* only (seasons, teams, shooters, fixtures, scores, handicap config) | One click, in the browser | Any admin, no tooling needed |

Neither layer captures **login accounts** (`auth.users` — emails/passwords).
That's a deliberate simplification: after a restore, admins/captains just
sign up again and get promoted to their role/team via the Accounts panel
or a one-off SQL update (see [Restoring](#restoring) below). If full
account continuity ever becomes a requirement, use Supabase's own
project-level backup/restore feature (Dashboard → Database → Backups,
paid plans) instead, which does capture `auth`.

The admin-panel export is the easy, no-install safety net — use it
often. This document is the real disaster-recovery procedure: it rebuilds
the database from nothing, byte-for-byte, including the schema itself.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (bundles
  `pg_dump`/`pg_restore`-compatible tooling), **or** the Postgres client
  tools (`pg_dump`, `pg_restore`, `psql`) installed directly.
- The project's **direct database connection string**: Supabase Dashboard
  → Project Settings → Database → Connection string → URI. Use the
  *direct* connection (not the pooler) for dump/restore — it's more
  reliable for long-running operations.

Never commit the connection string (or a backup file — it contains real
names) to git. Store backups somewhere private: a password manager, an
encrypted drive, private cloud storage.

## Taking a backup

```bash
pg_dump --schema=public -Fc -f nadarl-backup-$(date +%Y%m%d).dump \
  "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
```

- `--schema=public` scopes the dump to the app's own schema — tables,
  views, functions, and their RLS policies — and skips Supabase's
  internally-managed schemas (`auth`, `storage`, `realtime`, ...), which a
  fresh project already provisions on its own.
- `-Fc` (custom format) is compressed and lets `pg_restore` do a clean,
  ordered restore. Use `-Fp` instead for a plain `.sql` file if you'd
  rather be able to read/edit it directly.

Do this periodically (e.g. monthly), and before/after anything risky in
the admin panel (season resets, bulk deletes).

## Restoring

1. Create a **new, empty** Supabase project and grab its direct
   connection string.
2. Restore the dump into it:

   ```bash
   pg_restore --schema=public --no-owner --no-privileges \
     -d "postgresql://postgres:[PASSWORD]@[NEW-HOST]:5432/postgres" \
     nadarl-backup-20260802.dump
   ```

   (`--no-owner --no-privileges` avoids failures from role names that
   don't exist in the new project — Supabase re-grants the right
   privileges to `anon`/`authenticated` automatically via the dumped
   `GRANT` statements from `public`, but ownership is best left alone.)

3. Point the site at the new project: update `JS/supabase-keys.js` with
   the new project's URL and anon key.
4. Re-create accounts: have each admin/captain sign up again, then
   promote them in the Supabase SQL Editor:

   ```sql
   update public.user_profile
      set role = 'admin', team_id = null
    where email = 'someone@example.com';
   ```

   (or `role = 'captain', team_id = '<team uuid>'` for captains — see the
   Accounts panel in `admin.html` for a friendlier UI once at least one
   admin exists.)

**No `pg_dump` file handy?** Fall back to the lighter path: run
`supabase/schema.sql` then every file in `supabase/migrations/` (in
filename order) against the new project's SQL Editor to rebuild the empty
schema — same procedure as first-time setup in the main `README.md` —
then use the admin panel's **Import Data** button with your most recent
JSON export to restore the table data.

## Testing a backup

A backup you've never restored is a guess, not a backup. Periodically
spin up a scratch Supabase project and run the restore procedure above
against it, just to confirm the dump actually works end-to-end.
