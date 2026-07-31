# Status: backend

State: ready_for_integrate
Wave: 2
Updated: 2026-07-31
Branch: `local/backend-gaps-api-1fb3`

## Done

- Neon Auth scaffold (ADR 0006 — **not Clerk**):
  - `apps/web/lib/auth/server.ts` — `createNeonAuth` when `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (≥32) set
  - `apps/web/app/api/auth/[...path]/route.ts` — handler; **503 stub** if env missing (build-safe)
  - `apps/web/proxy.ts` — protect practice/prep/account + user APIs; **passthrough** when auth stubbed
  - `apps/web/lib/auth/client.ts` — browser `createAuthClient`
- RLS helper: `apps/web/lib/db/rls.ts` sets GUC `app.neon_auth_user_id` inside Neon HTTP transactions
- Typed APIs via `@ibpe/contracts` (+ local envelopes in `lib/api/schemas.ts`):
  - `GET /api/questions`, `GET /api/questions/[id]`
  - `GET /api/questions/[id]?view=study` layered reveal payload from `published.v_answers` when available
  - `GET /api/firms/[firmId]/heat` (published view or empty stub)
  - `POST/GET /api/practice/sessions` (+ Server Action `startPracticeSession`); local `simulator` mode extension until contracts land
  - `POST /api/practice/sessions/[id]/attempts` (attempt + mastery update; DB path falls back on missing FKs/tables)
  - `GET|POST /api/search` (substring proxy until `ibpe-search`)
  - `GET /api/notes`, `GET /api/mastery`, `GET /api/admin/status`, `GET /api/health`
- Missing product APIs added on `local/backend-gaps-api-1fb3`:
  - `GET|PUT /api/targets` — `app.user_profiles.preferences_json` live path; default/in-memory fallback
  - `GET /api/learn/modules`, `GET /api/learn/modules/[slug]` — static MVP modules/checkpoints until module tables land
  - `GET /api/concepts`, `GET /api/concepts/[slug]` — `published.v_concepts` when present plus static diagrams/resources bridge
  - `POST /api/prep/rag` — `@ibpe/search buildPseudoRagPack`; published answers or static teaching docs; Glassdoor/bank heat only
  - `GET /api/prep/heat?firm_id=...` — published firm heat with static/bank fallback
  - `GET|PUT /api/study-plan` — `app.study_plans.plan_json` attempt; in-memory/default fallback
  - `GET|POST /api/bookmarks`, `GET|POST /api/collections` — existing app tables where compatible; stub for unsupported item shapes
- Graceful degrade: no `DATABASE_URL` → `data/question_bank.json` fallback for questions; in-memory practice
- Importer CLI: `apps/web/scripts/import-question-bank.ts` wraps `@ibpe/database` `seedQuestionBank` (idempotent firm signals)
- Verified: `npm run typecheck -w @ibpe/web`; `npm run lint -w @ibpe/web` (pre-existing frontend/env warnings only); direct route smoke for targets/modules/concepts/heat/RAG/simulator/attempts/study-plan/bookmarks/collections

## Follow-ups (not blocking Wave 2 scaffold)

- Provision Neon Auth + `DATABASE_URL` in Vercel / Cloud Agents secrets for live path
- Frontend owns `/auth/*` UI + NeonAuthUIProvider
- Merge `local/backend-gaps-contracts-1fb3` and replace local Zod extensions for `simulator`, modules, study-plan module items, collections, RAG metadata
- Merge `local/backend-gaps-db-1fb3` and switch targets/modules/collection-items/study-plan/attempt confidence fields from stub/JSON fallbacks to first-class tables
- No migrations invented (database stream owns SQL)

## Must / compliance

- [x] Typed responses via contracts
- [x] No long scrapes in request handlers
- [x] Neon Auth env + RLS GUC hook
- [x] No Glassdoor secrets in `NEXT_PUBLIC_*`
- [x] Status file only under `docs/agent-run/status/backend.md`
