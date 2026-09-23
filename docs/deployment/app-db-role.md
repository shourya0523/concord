# App database role (`concord_app`) — RLS as a real second line of defence

**Status:** migration `042_app_rls_role.sql` ready; production `DATABASE_URL` switch is an **owner deploy step** (below).

## Why

The Vercel `DATABASE_URL` connects as `neondb_owner`. On Neon that role has
`rolbypassrls = true` (via `neon_superuser`), so every `app.*` policy in
`030` / `032` / `041` / `042` is ignored for it — `FORCE ROW LEVEL SECURITY`
does not stop a `BYPASSRLS` role. Today, per-user isolation holds only because
each query in `apps/web/lib/data/*.ts` also filters on
`neon_auth_user_id = $user`.

`042` adds `concord_app`: a non-owner `LOGIN` role with `NOBYPASSRLS` and only
the grants the web app needs. Once the web app connects as `concord_app`, the
`app.neon_auth_user_id` GUC set by `withRlsUserId` (`apps/web/lib/db/rls.ts`)
actually scopes rows, so a missing `WHERE` in app code can no longer leak or
modify another user's data.

## What `042` does

| Area | Change |
|------|--------|
| Role | `concord_app` — `LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`, no role memberships, **no password** (set per branch, below) |
| Grants | `USAGE` on `app`, `published`, `canonical`; `SELECT` on all `published.*` and `canonical.*`; `SELECT/INSERT/UPDATE/DELETE` on all `app.*`. Nothing on `raw`, `staging`, `admin`, `neon_auth`; no DDL. |
| Policies added | `app.review_queue` (same as `041`), `app.confidence_ratings`, `app.study_plans` (by `user_id`), `app.study_session_questions` (via owning `study_sessions` row). On production these tables had RLS on but **no policy**, which denies everything to a non-bypass role — `study_plans` would have broken. |
| FORCE RLS | All 15 `app.*` tables (previously `users`, `user_profiles`, `collections`, `study_sessions`, `confidence_ratings`, `study_plans`, `study_session_questions`, `review_queue` were not forced). |
| Guard | Migration fails if any `app.*` table lacks RLS, FORCE or a policy, or if `concord_app` can bypass RLS. |

`published.*` views are `security_invoker`, so `concord_app` also needs
`SELECT` on the `canonical` tables beneath them; canonical RLS (`030`/`032`)
keeps those to published rows. Branch test: `concord_app` sees the same row
counts as the owner on every `published` view and the `canonical` tables the
app reads.

Applying `042` is **zero-impact on the running app**: it still connects as
`neondb_owner` (bypasses RLS) until `DATABASE_URL` changes.

## Owner deploy steps

Do this on a Neon **branch** first, run the check, then repeat on `production`.

1. **Apply the migration** (as `neondb_owner`, direct URL):

   ```bash
   psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/042_app_rls_role.sql
   # or: cd packages/database && DATABASE_URL="$OWNER_DATABASE_URL" npm run migrate
   ```

   Note: `npm run migrate` applies every file in its list not yet in
   `public.schema_migrations` — on production that currently includes `040`.

2. **Set the password** with SQL. Do **not** create or manage this role in
   the Neon console/API: console-created roles join `neon_superuser`, and
   `neondb_owner` (created that way) has `BYPASSRLS`.

   ```sql
   -- as neondb_owner; generate e.g. `openssl rand -base64 32 | tr -d '/+='`
   ALTER ROLE concord_app WITH PASSWORD '<generated>';
   SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'concord_app';  -- f, f
   ```

3. **Build the URL** — same host/db/params as the current pooled URL, new user:

   ```text
   postgresql://concord_app:<password>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. **Verify isolation** before switching (as `concord_app`, one transaction —
   `set_config(..., true)` is transaction-local, exactly like `withRlsUserId`):

   ```sql
   BEGIN;
   SELECT set_config('app.neon_auth_user_id', '<some real user id>', true);
   SELECT count(*) FROM app.notes;                        -- that user's notes only
   SELECT set_config('app.neon_auth_user_id', 'nobody', true);
   SELECT count(*) FROM app.notes;                        -- 0
   SELECT count(*) FROM raw.sources;                      -- ERROR: permission denied
   ROLLBACK;
   ```

5. **Switch Vercel.** Project `concord` → Settings → Environment Variables →
   `DATABASE_URL` (sensitive; currently one value for Preview + Production, set
   manually — not managed by the Neon integration). Prefer splitting it:
   - **Preview:** `concord_app` URL on a Neon preview branch.
   - **Production:** `concord_app` URL on `production`.

   Redeploy (env changes apply to new deployments only), then run
   `BASE_URL=https://concord-umber.vercel.app bash scripts/prod_smoke.sh` and
   sign in to check notes, saved items, study plan, practice and progress.

6. **Rollback:** set `DATABASE_URL` back to the `neondb_owner` URL and
   redeploy. `042` itself needs no rollback (no effect on `neondb_owner`).

## Keep using the owner URL for

Migrations (`packages/database` `migrate`), seeds and batch scripts
(`seed:bank`, `publish-teaching`, `embed-rag`, `link-occurrences`,
`apps/web/scripts/import-question-bank.ts`) and workers write `canonical` /
`raw` / `staging` — keep them on `neondb_owner` (local `.env` / worker
secrets), never the Vercel web URL.

## Rules for future migrations

- **New `app.*` table:** `ENABLE` + `FORCE ROW LEVEL SECURITY`, a
  `*_self` policy keyed on `app.neon_auth_user_id`, and
  `GRANT SELECT, INSERT, UPDATE, DELETE ON app.<t> TO concord_app`. There are
  deliberately no default privileges: a forgotten grant fails loudly
  (`permission denied`) instead of silently exposing a table without a policy.
  Re-running `042` re-checks the RLS/FORCE/policy invariant.
- **New `published` view or `canonical` table the app reads:**
  `GRANT SELECT ... TO concord_app`. `DROP` + `CREATE` of a view drops its
  grants; `CREATE OR REPLACE` keeps them.
- **App code:** every `app.*` query runs inside `withRlsUserId` and keeps its
  own `neon_auth_user_id = $user` filter — RLS is the second line, not the
  first.

## Query audit (`apps/web/lib/data/*.ts`, `apps/web/app/api/**`)

All `app.*` reads/writes run inside `withRlsUserId` and filter by the caller's
`neon_auth_user_id`: `notes`, `mastery`, `profile`, `progress`, `saved-items`
(bookmarks, collections, collection items), `targets`, `study-plan`,
`attempts`, `practice.createPracticeSession`, `GET /api/notes`.

Fixed in this change: `getPracticeSession` had a branch without `userId` that
queried `app.study_sessions` outside `withRlsUserId`, and its `userId` branch
filtered only by session id (under the bypass role any signed-in user could
read another user's session by id). `userId` is now required and the query
joins `app.users` on the caller.

Outside `withRlsUserId` by design (catalog, no user data): `catalog`,
`questions`, `firms`, `learning`, `rag`, `prep`, `practice-packs`, and the
`canonical.firms` existence check in `targets.putTargetCompanySet`.

## Branch test record

2026-09-23, Neon branch `test/app-rls-role-042` (from `production`), `042`
applied twice (idempotent), then again after `041`. Over Neon HTTP
(`/sql`, same path as `@neondatabase/serverless`), logged in as `concord_app`:

- user A wrote one row to each of the 15 `app.*` tables using the app's SQL
  (including `ON CONFLICT` upserts) and read back 1 row each;
- user B's GUC: **0 of A's rows** in all 15 tables; `UPDATE`/`DELETE` of A's
  rows affected 0 rows; inserting a note/review row with A's `user_id`, an item
  into A's collection, a question into A's session, or an `app.users` row
  claiming A's auth id → `new row violates row-level security policy`;
- no GUC: 0 rows everywhere; `raw`, `staging`, `admin`, `neon_auth` →
  permission denied; `CREATE TABLE` / `ALTER TABLE ... NO FORCE` → denied;
- owner confirmed A's rows unchanged; catalog row counts identical to owner;
  pgvector `<=>` search works.
