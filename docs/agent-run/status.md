# Programme status

**Phase:** Design Phase 2 gap-close — integrated on PR branch
**Base:** `main` @ `3ccd6f2`
**Branch:** `local/design-frontend-continue-bb32` (PR #34) — absorbs #33 + WS polish
**Updated:** 2026-07-31

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete (#15 + #16) — verified |
| Wave 2 | Complete on main (#19–#22) — product live |
| Wave 3 | Integrate PR #25 — QA + infra merged; search GET + AppShell `<main>` fixed |
| Design Phase 1 | Complete — Mode A, Mode B, plan/simulator, and paper workspace deployed |
| Design Phase 2 gap-close | In PR #34 — items 1–6 shipped; verify/deploy pending merge |

## Design Phase 1 (2026-07-31)

- Mode A: real target persistence, occurrence heat, grounded prep packs, and question attempts.
- Mode B: real module catalog/hubs, concept API data, module-to-company bridges, and study layers.
- Plan/simulator: real study-plan and practice-session APIs with persisted attempts.
- Visual system: black/grey chrome, cream document canvas, pastel semantic heat, paper/rough accents.
- Provenance boundary preserved: Glassdoor supplies occurrence signals only; teaching answers use published corpus sources.
- Auth boundary preserved: Neon Auth remains the product auth implementation; no Clerk dependency.

### Verification

| Check | Result |
|-------|--------|
| `@ibpe/web` typecheck | Pass |
| `@ibpe/web` lint | Pass with 21 pre-existing/non-blocking warnings |
| `@ibpe/web` production build | Pass; 29 static pages generated |
| Python unit/integration suite | Pass; 114 tests |
| `python main.py query --track IB` | Pass; 2,861 questions |
| Local production smoke | Pass |
| Production `/learn`, `/plan`, `/simulator` | HTTP 200 |
| Production health | HTTP 200; Neon Auth + database configured |

### Production note

The Vercel Git deployment is live at https://concord-umber.vercel.app. Anonymous
requests to protected routes correctly redirect to Neon Auth, so the legacy
`scripts/prod_smoke.sh` reports those 307 responses as failures even though the
auth boundary is operating as configured. Public pages and APIs pass; an
authenticated smoke still requires a test user/session.

## Phase 2 rework (2026-07-31)

- Backend: untagged occurrences (`v_firm_topic_heat` returned only `untagged`) fixed via migration 034 — `keyword_rules_v1` tagging of 3,492 occurrences + canonical questions; heat views rewritten; applied to prod Neon.
- Backend: migration 035 seeds the three-statement diagram + learning resources.
- Backend: firm id mismatch (mock `firm_gs` vs DB `firm_goldman-sachs`) fixed with `/api/firms` catalog (42 firms + occurrence volumes) and `/api/firms/[firmId]/signals`.
- Backend: hardcoded weak topics now mastery-derived; mock RAG fallback now reads the published corpus; default targets no longer fabricated.
- Surfaces: all DESIGN.md §10 screens built — onboarding wizard, dashboard, `/companies` index + room, heat compare insights, RAG pack preview, study layered reveal with inline mermaid, learn catalog + module roadmap, concepts index + lab, plan composer + catch-up, simulator cast + score reveal, progress, settings, landing.
- Surfaces: real backend wiring throughout; paper design system (black/grey chrome, cream document, pastel semantics, rough-notation semantic map).
- Rendering: `DiagramCanvas` stub replaced with a real dynamic-import mermaid renderer (paper-styled); `(product)/loading.tsx`; proxy `loginUrl` fix.

### Verification

| Check | Result |
|-------|--------|
| `@ibpe/web` typecheck | Pass |
| `@ibpe/web` lint | 0 errors; 41 warnings (same class as baseline) |
| `@ibpe/web` production build | Pass; 48 routes |
| Python unit/integration suite | Pass; 114 tests |
| Local + production smokes | Pass — real tagged heat (e.g. Goldman behavioral n=62 / valuation n=50); signals total 456; concepts with diagrams; module checkpoints with 6 real question ids; pages 200 |
| Browser E2E | Video recorded |

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

- Neon Auth and `DATABASE_URL` are configured on production; authenticated smoke still needs a test user/session.
- `VERCEL_TOKEN` is present but rejected as `User not found`; Git-linked deploy is live.
- Sentry/OTEL + Neon backups not provisioned

## Product env (live auth)

Vercel / `.env.local`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`
