# Status: database

State: done (Wave 1 exit)
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-database-a9ff` @ `e880ce1`

## Done

- Dual migration path (`migrations/README.md`):
  - `001_init.sql` — SQLite corpus mirror (`ibpe_corpus` / `db.py` unchanged)
  - `010_neon_platform.sql` — Neon layered schema (§16–17)
  - `020_neon_published.sql` — `v_questions`, `v_answers`, `v_concepts`, `v_firm_topic_heat`, `v_company_room_signals`
  - `030_neon_rls.sql` — RLS on raw/staging/app/admin + published SELECT grants
- `packages/database` (`@ibpe/database`): Neon lazy client (`@neondatabase/serverless` + drizzle), schema mirrors, field map, idempotent `seed:bank`
- Bank → layers: legacy SHA1 `id` → `staging.legacy_bank_id` / occurrence PK; `process` is signal-only (no teaching answers)
- Verified: `npm run typecheck`, `npm run seed:bank -- --dry-run`

## Commands

```bash
cd packages/database && npm install
DATABASE_URL=… npm run migrate
DATABASE_URL=… npm run seed:bank
npm run seed:bank -- --dry-run
```

## Blockers

- Neon `DATABASE_URL` not in this environment — apply migrate/seed when Marketplace Neon is provisioned.

## Handoff

- Data-quality: GitHub → `canonical.*` + `publishable=true`
- Backend (W2): set `app.clerk_user_id` for RLS; read `published.*` only
