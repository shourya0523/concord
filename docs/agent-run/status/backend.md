# Status: backend

State: ready_for_integrate
Wave: 2
Updated: 2026-07-30
Branch: `local/ws-backend-a9ff`

## Done

- Neon Auth scaffold (ADR 0006 — **not Clerk**):
  - `apps/web/lib/auth/server.ts` — `createNeonAuth` when `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (≥32) set
  - `apps/web/app/api/auth/[...path]/route.ts` — handler; **503 stub** if env missing (build-safe)
  - `apps/web/proxy.ts` — protect practice/prep/account + user APIs; **passthrough** when auth stubbed
  - `apps/web/lib/auth/client.ts` — browser `createAuthClient`
- RLS helper: `apps/web/lib/db/rls.ts` sets GUC `app.neon_auth_user_id` inside Neon HTTP transactions
- Typed APIs via `@ibpe/contracts` (+ local envelopes in `lib/api/schemas.ts`):
  - `GET /api/questions`, `GET /api/questions/[id]`
  - `GET /api/firms/[firmId]/heat` (published view or empty stub)
  - `POST/GET /api/practice/sessions` (+ Server Action `startPracticeSession`)
  - `GET|POST /api/search` (substring proxy until `ibpe-search`)
  - `GET /api/notes`, `GET /api/mastery`, `GET /api/admin/status`, `GET /api/health`
- Graceful degrade: no `DATABASE_URL` → `data/question_bank.json` fallback for questions; in-memory practice
- Importer CLI: `apps/web/scripts/import-question-bank.ts` wraps `@ibpe/database` `seedQuestionBank` (idempotent firm signals)
- Verified: `tsc --noEmit`, `next build --webpack`, smoke (`/api/health`, questions bank_fallback, practice stub, auth 503)

## Follow-ups (not blocking Wave 2 scaffold)

- Provision Neon Auth + `DATABASE_URL` in Vercel / Cloud Agents secrets for live path
- Frontend owns `/auth/*` UI + NeonAuthUIProvider
- Hybrid search replacement owned by `ibpe-search`
- No migrations invented (database stream owns SQL)

## Must / compliance

- [x] Typed responses via contracts
- [x] No long scrapes in request handlers
- [x] Neon Auth env + RLS GUC hook
- [x] No Glassdoor secrets in `NEXT_PUBLIC_*`
- [x] Status file only under `docs/agent-run/status/backend.md`
