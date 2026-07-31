# @ibpe/database

**Owner:** `ibpe-database` · Wave 1 data platform for Neon Postgres (ADR 0001).

## Thesis

| Source | Lands as | Not |
|--------|----------|-----|
| `data/question_bank.json` (Glassdoor) | `staging.staging_records` + `canonical.question_occurrences` (firm signals) | Teaching answers |
| GitHub / static corpus | `canonical.canonical_questions` + `canonical.answers` | — |

App reads **`published.*` views only** in production.

## Stack

- `@neondatabase/serverless` + `drizzle-orm` (HTTP neon driver)
- **No** `@vercel/postgres`
- SQL migrations in `/migrations` (sole owner)

## Env

```bash
DATABASE_URL=postgresql://…   # Neon; prefer pooled for serverless
```

Scripts load `.env.local` / `.env` via `dotenv` (Next does not auto-load for `tsx`).

## Commands

```bash
cd packages/database
npm install
npm run migrate                 # apply Neon migrations 010+
npm run seed:bank               # default ../../data/question_bank.json
npm run seed:bank -- --path /abs/path/question_bank.json --limit 100
npm run seed:bank -- --dry-run
```

## Dual path (SQLite corpus)

Python `src/ibpe_corpus/storage/db.py` + `migrations/001_init.sql` remain the **local SQLite** corpus store. Neon uses schemas `raw` / `staging` / `canonical` / `published` / `app` / `admin`. Name mapping:

| SQLite (`001_init` / db.py) | Neon |
|-----------------------------|------|
| `source_artefacts` | `raw.source_artifacts` |
| `raw_records` | `staging.raw_records` |
| `canonical_questions` | `canonical.canonical_questions` |
| `question_variants` | `canonical.question_variants` |
| `interview_occurrences` | `canonical.question_occurrences` |
| `answers` | `canonical.answers` |
| `jobs` | `admin.ingestion_jobs` |
| `merge_audit` | `admin.merge_decisions` |
| `source_registry` | `raw.sources` |

## Field map

See `src/field-map.ts` and `docs/field-map.md`.

Idempotency key: legacy bank `id` = SHA1(`company|position|question.strip().lower()`).

## Lazy client

```ts
import { getDb, getSql } from "@ibpe/database";

const sql = getSql(); // throws only when first called without DATABASE_URL
```
