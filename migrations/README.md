# Migrations

**Owner:** `ibpe-database` (sole owner — other streams propose via contracts, do not land conflicting SQL).

## Dual storage path

| Path | Engine | How applied | Used by |
|------|--------|-------------|---------|
| `001_init.sql` | **SQLite** | Optional mirror; `src/ibpe_corpus/storage/db.py` already creates the same tables via SQLAlchemy `METADATA.create_all` | Teaching corpus jobs / local SQLite file |
| `010_neon_*.sql` onward | **Neon Postgres** | `psql "$DATABASE_URL" -f …` or package scripts | Product app, published views, Wave 2+ |

Do **not** apply Neon migrations to the SQLite corpus DB. Do **not** apply `001_init.sql` to Neon (uses `PRAGMA` / SQLite types).

```text
SQLite corpus (ibpe_corpus)          Neon product (ADR 0001)
─────────────────────────            ───────────────────────
001_init.sql (dialect mirror)        010_neon_platform.sql
db.py METADATA.create_all            020_neon_published.sql
                                     030_neon_rls.sql
                                     031_neon_auth_user_id.sql
```

Corpus table names stay stable for Python (`interview_occurrences`, `source_artefacts`, …). Neon uses the §17 product names (`question_occurrences`, `source_artifacts`, …) with a documented mapping in `packages/database/README.md`.

## Apply Neon (local / preview)

```bash
export DATABASE_URL='postgresql://…'   # Neon pooled or direct; never commit
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/010_neon_platform.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/020_neon_published.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/030_neon_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/031_neon_auth_user_id.sql
```

Or from the package:

```bash
cd packages/database && npm run migrate
```

## Seed

Idempotent Glassdoor bank import (occurrences / firm signals only):

```bash
cd packages/database && npm run seed:bank -- --path ../../data/question_bank.json
```

Uses legacy bank `id` (SHA1 of `company|position|question`) as the primary idempotency key.

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Neon path | Prefer Vercel Marketplace Neon; use pooled URL for serverless |
| Never | — | Do not use sunset `@vercel/postgres` |

## 031

`031_neon_auth_user_id.sql` — rename legacy `clerk_user_id` → `neon_auth_user_id` when upgrading older Wave 1 DBs (ADR 0006). Fresh 010/030 already use Neon Auth column names.
