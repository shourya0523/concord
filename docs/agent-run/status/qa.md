# Status: qa

State: complete
Wave: 3
Updated: 2026-07-30
Branch: `local/ws-qa-d1de`

## Objective

Enforce prompt §45 Product + Release gates after Wave 2 on main. Produce test / a11y / perf reports. Guard CLI regressions.

## Deliverables

| Artifact | Path |
|----------|------|
| Test / product gate | `reports/test-report.md` |
| Accessibility | `reports/accessibility-report.md` |
| Performance | `reports/performance-report.md` |
| Evidence screenshots | `reports/qa-evidence/` |
| Re-runnable smoke | `scripts/qa_product_smoke.sh` |

## Gate verdict (Wave 3 exit)

| Gate | Result |
|------|--------|
| Product gate | **Pass** with Partial Fail on `GET /api/search` coercion; auth 503 stub OK |
| Release gate | **Pass** (a11y findings non-blocking; prod perf OK; CLI OK) |
| CLI regression | **Pass** — `python3 main.py query --track IB` (2861) |
| PR-ready | **Yes** — reports + smoke script; known limitations documented |

## Blockers / follow-ups (do not block merge of QA docs)

1. Backend/contracts: coerce `limit`/`offset` on `GET /api/search` (or `z.coerce.number()`).
2. Frontend: wrap AppShell children in `<main>`.
3. Infra/DB: apply published views when `DATABASE_URL` set; else leave unset for bank_fallback.
4. Neon Auth still unset in prod — expected 503.

## Notes

- Driver: `agent-browser` (no third browser stack).
- Prod: https://concord-umber.vercel.app
- Glassdoor scrape not required for product gates.
