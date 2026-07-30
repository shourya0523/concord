# Performance report (Workstream K — QA)

**Wave:** 3  
**Branch:** `local/ws-qa-d1de`  
**Updated:** 2026-07-30  
**Method:** Navigation Timing via `agent-browser eval` + `curl -w` TTFB against production. No Lighthouse CI (avoid third browser stack).

## Verdict

**Pass** for Wave 3 release gate on production: document load and TTFB are well within soft budgets for marketing/product pages. Local cold compiles are slower (expected for `next dev`).

## Soft budgets (QA)

| Metric | Budget | Prod result |
|--------|--------|-------------|
| curl TTFB (HTML) | < 1.0s | **~35–60ms** |
| curl TTFB (`/api/health`) | < 1.0s | **~100ms** |
| Navigation `load` (warm browser) | < 3.0s | **~30–130ms** on prod |
| Transfer size (document) | informational | ~4–8 KB encoded HTML shells |

## Production — curl

| Path | TTFB | Total | Size | Code |
|------|------|-------|------|------|
| `/` | 0.058s | 0.058s | 17170 | 200 |
| `/dashboard` | 0.036s | 0.036s | 25696 | 200 |
| `/api/health` | 0.103s | 0.103s | 110 | 200 |
| `/api/questions?limit=1` | 0.066s | 0.066s | 365 | 200 |

## Production — Navigation Timing (agent-browser)

| Route | TTFB (ms) | DCL (ms) | load (ms) | encodedBodySize |
|-------|-----------|----------|-----------|-----------------|
| `/` | 4 | 90 | 120 | 4244 |
| `/dashboard` | 3 | 30 | 33 | 5789 |
| `/prep/heat` | 4 | 66 | 68 | 5236 |
| `/prep/rag` | 4 | 83 | 90 | 6527 |
| `/companies/goldman-sachs` | 4 | 72 | 133 | 7662 |
| `/concepts/dcf-valuation` | 3 | 31 | 33 | 6821 |
| `/study` | 3 | 32 | 34 | 5542 |
| `/sign-in` | 3 | 27 | 29 | 4956 |

## Local — Navigation Timing (`next dev`)

| Route | TTFB (ms) | DCL (ms) | load (ms) | Notes |
|-------|-----------|----------|-----------|-------|
| `/` | 44 | 82 | 671 | Warm |
| `/onboarding` | 1043 | 1067 | 1534 | First compile |
| `/dashboard` | 444 | 474 | 956 | |
| `/prep/heat` | 2079 | 2105 | 2592 | First compile |
| `/prep/rag` | 570 | 592 | 1106 | |
| `/companies/goldman-sachs` | 1492 | 1515 | 2001 | First compile |
| `/concepts/dcf-valuation` | 1119 | 1145 | 1618 | |
| `/study` | 466 | 494 | 914 | |
| `/sign-in` | 2681 | 2705 | 3609 | First compile; still < soft fail for local |

Local spikes are compile latency, not production regressions.

## Observations / follow-ups

1. Prefer measuring against **production** or `next start` for gate numbers; `next dev` overstates TTFB.
2. GET `/api/search` validation failure is functional, not perf.
3. When Neon DB + published views are live, re-check `/api/questions` and heat latency vs bank_fallback.
4. No critical CLS/LCP tooling in this pass; visual smoke screenshots show content above the fold without obvious layout thrash.

## Evidence

- `reports/qa-evidence/prod_*.png`, `local_*.png`
- Companion: `reports/test-report.md`
