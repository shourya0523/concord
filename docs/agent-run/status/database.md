# Status: database

State: in_progress
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-database-a9ff`

## Done

- Dual migration path documented (`migrations/README.md`):
  - `001_init.sql` — SQLite corpus mirror (unchanged dialect; `ibpe_corpus` / `db.py` still works)
  - `010_neon_platform.sql` — Neon layered schema (§16–17)
  - `020_neon_published.sql` — app views (`v_questions`, `v_answers`, `v_concepts`, `v_firm_topic_heat`, `v_company_room_signals`)
  - `030_neon_rls.sql` — RLS on raw/staging/app/admin + published SELECT grants
- `packages/database` (`@ibpe/database`): Neon lazy client, Drizzle schema mirrors, field map, idempotent `seed:bank`
- Bank → layers map: legacy SHA1 `id` → `staging.legacy_bank_id` / occurrence PK; `process` stays signal-only (no teaching answers)

## Commands

```bash
cd packages/database && npm install
DATABASE_URL=… npm run migrate
DATABASE_URL=… npm run seed:bank
npm run seed:bank -- --dry-run
```

## Blockers

- Neon `DATABASE_URL` not provisioned in this environment yet — migrate/seed apply blocked until Marketplace/CLI Neon URL is set (design + package code landed offline).

## Next

- Apply migrations + full bank seed against preview Neon
- Coordinate with data-quality for GitHub → canonical Q/A publish path
