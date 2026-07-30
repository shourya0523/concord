# Backend importer (Workstream D)

Thin CLI over `@ibpe/database` `seedQuestionBank` — **idempotent** Glassdoor
`data/question_bank.json` → Neon `staging.staging_records` +
`canonical.question_occurrences` (firm signals only).

## Prerequisites

1. Migrations applied (`ibpe-database` owns `migrations/**`):
   - `010_neon_platform.sql`, `020_neon_published.sql`, `030_neon_rls.sql`, …
2. `DATABASE_URL` in `.env` / `.env.local` (never `NEXT_PUBLIC_*`).

## Commands

```bash
# Validate JSON path (no DB)
npm run import:bank -w @ibpe/web -- --dry-run

# Sample import
npm run import:bank -w @ibpe/web -- --limit 50

# Full bank
npm run import:bank -w @ibpe/web -- --path data/question_bank.json
```

Equivalent owned seed:

```bash
npm run seed:bank -w @ibpe/database -- --dry-run
```

## Notes

- Does **not** create teaching answers (GitHub / answers stream).
- Does **not** run Glassdoor scrapes — import only.
- Re-runs upsert on `legacy_bank_id` conflict keys.
- If Neon is unavailable in this environment, keep using `--dry-run` and defer
  live import to a machine with `DATABASE_URL`.
