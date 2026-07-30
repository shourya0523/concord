# Status: qa

State: in_progress
Wave: 3
Updated: 2026-07-30
Branch: `local/ws-qa-d1de`

## Objective

Enforce prompt §45 Product + Release gates after Wave 2 on main. Produce test / a11y / perf reports. Guard CLI regressions.

## Progress

- Branch created from `origin/main`
- Prod smoke (curl): pages `/`, `/onboarding`, `/dashboard`, `/prep/heat`, `/prep/rag`, `/study`, `/sign-in`, `/companies/goldman-sachs`, `/concepts/dcf-valuation` → 200
- `/api/health` → 200 (`auth: stub`, `database: unavailable`)
- `/api/questions` → 200 bank_fallback
- `/api/auth/*` → 503 stub (documented, not a hard fail)
- `/api/firms/*/heat` → 200 stub empty
- CLI: `python3 main.py query --track IB` → OK (2861 questions)
- Finding: `GET /api/search?q=` fails validation (limit/offset string vs number); `POST /api/search` OK
- Next: local browser + a11y/perf reports

## Notes

- Prod: https://concord-umber.vercel.app
- Neon Auth unset → 503 expected
- Glassdoor scrape not required for product gates
