# Status: database

State: done (backend gaps database pass)
Wave: backend-gaps-db-1fb3
Updated: 2026-07-31
Branch: `local/backend-gaps-db-1fb3`

## Done

- Dual migration path (`migrations/README.md`):
  - `001_init.sql` — SQLite corpus mirror (`ibpe_corpus` / `db.py` unchanged)
  - `010_neon_platform.sql` — Neon layered schema (§16–17)
  - `020_neon_published.sql` — `v_questions`, `v_answers`, `v_concepts`, `v_firm_topic_heat`, `v_company_room_signals`
  - `030_neon_rls.sql` — RLS on raw/staging/app/admin + published SELECT grants
  - `031_neon_auth_user_id.sql` — legacy `clerk_user_id` rename guard
  - `032_learning_flows.sql` — learning modules/checkpoints/prerequisites/module concepts, target company sets, module progress, collection items, simulator mode check, RLS, published module views, illustrative modules
- `packages/database` (`@ibpe/database`): Neon lazy client (`@neondatabase/serverless` + drizzle), schema mirrors, field map, idempotent `seed:bank`
- Bank → layers: legacy SHA1 `id` → `staging.legacy_bank_id` / occurrence PK; `process` is signal-only (no teaching answers)
- Drizzle mirrors added for `learningModules`, `learningModuleCheckpoints`, `learningModulePrerequisites`, `learningModuleConcepts`, `targetCompanySets`, `moduleProgress`, `collectionItems`
- Target company sets mirror the contracts shape with `firm_ids` JSON array and nullable `primary_firm_id`
- `study_plans.plan_json` remains jsonb and is documented for module/checkpoint assignment items
- Verified: `npm run typecheck -w @ibpe/database`; `npm run migrate -w @ibpe/database` applied through `032` and reran idempotently; `npm run seed:bank -w @ibpe/database -- --dry-run`; live object query confirmed 5 seeded modules and 10 checkpoints

## Commands

```bash
cd packages/database && npm install
DATABASE_URL=… npm run migrate
DATABASE_URL=… npm run seed:bank
npm run seed:bank -- --dry-run
```

## Blockers

- Supabase MCP server requires authentication in this run, so RLS implementation was checked against repo migrations plus local Supabase skill guidance rather than live Supabase advisors.

## Handoff

- Backend/contracts: use `published.v_learning_modules`, `published.v_learning_module_checkpoints`, and app-scoped tables behind `app.neon_auth_user_id`
- Data-quality: GitHub → `canonical.*` + `publishable=true`; Glassdoor bank remains occurrence heat only
- Backend (W2): set `app.neon_auth_user_id` for RLS; read `published.*` only
