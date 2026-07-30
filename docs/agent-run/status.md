# Programme status

**Phase:** Wave 3 in progress  
**Base:** `main` @ Wave 2 integrate + Vercel live  
**Branch:** `local/orchestrator-wave3-d1de`  
**Updated:** 2026-07-30

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete (#15 + #16) — verified 2026-07-30 |
| Wave 2 | Complete on main (#19–#22) — product live |
| Wave 3 | In progress — QA + infra promote |

## Wave 1 verification (orchestrator)

| Check | Result |
|-------|--------|
| `packages/contracts`, `ui`, `database` | Present |
| Migrations `010`–`031` + ADR 0001–0006 | Present |
| `python3 main.py query --track IB` | OK (2861 IB) |
| CLI imports (`flask`, `selenium`, `seleniumbase`, `patchright`) | OK |
| `@ibpe/web` typecheck | OK |

## Wave 2 on main (already integrated)

- UI: `/onboarding`, `/dashboard`, `/prep/heat`, `/prep/rag`, `/companies/[firm]`, `/concepts/[slug]`, `/study`, `/sign-in`
- API: `/api/auth/*`, `/api/questions`, `/api/search`, `/api/practice/*`, `/api/firms/*/heat`
- Package: `@ibpe/search` (heat + pseudo-RAG)
- Prod: https://concord-umber.vercel.app (HTTP 200)

## Wave 3 (this branch)

| Agent | Branch | Focus |
|-------|--------|-------|
| `ibpe-qa` | `local/ws-qa-d1de` | Product/Release gates (§45), e2e/a11y/perf reports, CLI regression |
| `ibpe-infra` | `local/ws-infra-wave3-d1de` | Preview→prod smoke, monitoring/backups docs, worker health, env inventory |

## Product env (live auth)

Vercel / `.env.local`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`
