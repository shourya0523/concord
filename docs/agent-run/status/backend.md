# Status: backend

State: integrated
Wave: 2
Updated: 2026-07-31
Branch: `main` (merged contracts + DB + API; finish wiring on `local/backend-gaps-finish-1fb3`)

## Done

- Neon Auth scaffold (ADR 0006 — **not Clerk**)
- Typed APIs via `@ibpe/contracts` (local envelopes only in `lib/api/schemas.ts`):
  - Questions list/detail + `?view=study` → legacy `study` + `study_payload` (`QuestionStudyPayload`)
  - Firm heat, multi-firm heat (`GET /api/prep/heat`)
  - Pseudo-RAG (`POST /api/prep/rag` via `@ibpe/search`)
  - Practice sessions including **`simulator`** mode + attempts
  - Targets → `app.target_company_sets` (+ preferences_json mirror)
  - Learn modules → `canonical.learning_modules` / published checkpoint view (stub fallback)
  - Concepts, study plan, bookmarks, collections (+ `collection_items`)
  - Mastery live read with stub fallback
- Finish pass removed local duplicate Zod for modules/bookmarks/collections/study-plan/simulator

## Verify

- `npm run typecheck -w @ibpe/contracts -w @ibpe/web` pass
- `npm run lint -w @ibpe/web` — 0 errors

## Follow-ups

- Provision Neon Auth + `DATABASE_URL` in Vercel secrets for live path
- Frontend Learn pages (`/learn`) still pending Phase 1 design approval
- Hybrid search route still substring proxy until fully wired to `@ibpe/search` for all queries
