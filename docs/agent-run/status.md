# Programme status

**Phase:** Wave 3 integrate complete — ready for main  
**Base:** `main` @ Wave 2 + Vercel live  
**Branch:** `local/orchestrator-wave3-d1de`  
**Updated:** 2026-07-30

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete (#15 + #16) — verified |
| Wave 2 | Complete on main (#19–#22) — product live |
| Wave 3 | Integrate PR #25 — QA + infra merged; search GET + AppShell `<main>` fixed |

## Wave 1 verification

| Check | Result |
|-------|--------|
| Contracts / UI / database / search packages | Present |
| Migrations + ADR 0001–0006 | Present |
| `python3 main.py query --track IB` | OK (2861) |
| `@ibpe/web` typecheck | OK |

## Wave 2 surfaces (main)

- UI: `/onboarding`, `/dashboard`, `/prep/heat`, `/prep/rag`, `/companies/[firm]`, `/concepts/[slug]`, `/study`, `/sign-in`
- API: `/api/auth/*`, `/api/questions`, `/api/search`, `/api/practice/*`, `/api/firms/*/heat`
- Prod: https://concord-umber.vercel.app

## Wave 3 results

| Stream | Branch | Verdict |
|--------|--------|---------|
| QA | `local/ws-qa-d1de` | Product + Release gates **Pass** (reports + smoke) |
| Infra | `local/ws-infra-wave3-d1de` | Deployment smoke **Pass**; Neon/CLI blockers documented |

### Integrate fixes (orchestrator)

- Coerce `limit`/`offset` on `GET /api/search`
- Wrap AppShell content in `<main>` landmark

### Remaining non-blocking

- Neon Auth / `DATABASE_URL` unset on prod (auth 503 stub; bank_fallback OK)
- No `VERCEL_TOKEN` in this agent env (Git-linked deploy still live)
- Sentry/OTEL + Neon backups not provisioned

## Product env (live auth)

Vercel / `.env.local`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`
