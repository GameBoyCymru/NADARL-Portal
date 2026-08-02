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

**No `pg_dump` file handy?** Fall back to the lighter path below.

## Restoring from the admin-panel JSON export (no `pg_dump`)

This is also the procedure to use for a **test restore** — always do this
against a scratch project, never production.

1. **Create a throwaway Supabase project.** Dashboard → New Project. Wait
   for it to finish provisioning.
2. **Rebuild the empty schema.** In the new project's SQL Editor, run, in
   order: `supabase/schema.sql`, then every file in
   `supabase/migrations/` in filename order (they're date-prefixed, so
   alphabetical = chronological). Don't run `supabase/seed.sql` — you're
   about to import real data instead.
3. **Point a local copy of the site at the test project.** Get the new
   project's URL + anon key (Project Settings → API) and temporarily edit
   `JS/supabase-keys.js` to point at them — note your real production
   values first so you can switch back afterwards. Then serve locally
   (`python3 -m http.server 8000`, or any static server).
4. **Create an admin account on the test project.** It has no users yet.
   Sign up via `HTML/login.html` with any email (auto-creates a
   `user_profile` row with `role = 'pending'`), then promote yourself in
   the test project's SQL Editor:

   ```sql
   update public.user_profile set role = 'admin' where email = 'you@example.com';
   ```

5. **Import the data.** Log into `admin.html` on the test project, go to
   **Data Backup & Restore**, choose your `nadarl-backup-*.json` file, and
   click **Import Data**. Watch the status messages — it imports
   table-by-table, in FK-safe order (`season` → `team` → `shooter` →
   `match` → `exclusion` → `score` → `handicap_config`), and reports which
   table it's on if something goes wrong.

   Note: `handicap_config` is *upserted*, not inserted — its migration
   seeds a default row (`id=1`) as part of rebuilding the schema in step
   2, so the table is never actually empty the way the others are. Every
   other table expects to genuinely start empty; running an import twice,
   or against a project that already has data, will fail on the first
   duplicate key it hits rather than silently overwrite anything.

6. **Verify.** Check `table.html`, `fixtures.html`, `teams.html` on the
   test instance actually render the restored data correctly — that's the
   real point of a test restore, not just "did the import button say ok."
7. **Clean up.** Revert `JS/supabase-keys.js` to your real production
   values. Delete the test project, or keep it around for the next dry
   run.

Login accounts aren't part of the export (see above) — re-create the
ones you need to test with, same as any other restore.

## Testing a backup

A backup you've never restored is a guess, not a backup. Periodically run
either restore procedure above against a scratch project — the `pg_dump`
one to validate the full Postgres-level backup, the JSON one to validate
the admin-panel export — just to confirm each actually works end-to-end.
