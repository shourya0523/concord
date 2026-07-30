# Test report (Workstream K — QA)

**Wave:** 3  
**Branch:** `local/ws-qa-d1de`  
**Updated:** 2026-07-30  
**Prod:** https://concord-umber.vercel.app  
**Local:** `apps/web` Next.js 16 on port 3000  
**Driver:** `agent-browser` 0.27.0 (pipeline / headless)

## Story

Candidate opens IBPE Editorial Finance Terminal → selects target firms → reviews topic heat + pseudo-RAG packs → studies questions with layered reveal → concepts/company rooms → optional sign-in; APIs serve bank/published data with auth stub when Neon Auth unset.

## CLI regression

| Check | Result | Evidence |
|-------|--------|----------|
| `python3 main.py query --track IB` | **Pass** | JSON `count: 2861`, first hit Goldman Sachs “Tell me about yourself” |

## Product gate (§45)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Authentication works | **Skip / stub Pass** | `/sign-in` UI 200 (email/password fields). `GET /api/auth/session` → **503** `auth_not_configured` when Neon Auth env unset (documented; not a hard fail). |
| Company prep + visible topic heat + multi-target select | **Pass** | `/companies/goldman-sachs`, `/prep/heat`, `/dashboard` render firm multi-select + heat UI (browser snapshots + screenshots in `reports/qa-evidence/`). |
| Pseudo-RAG prep cited packs | **Pass** | `/prep/rag` shows focus prompt, firm select, weak-topic chips, citation UI. |
| Concept lab | **Pass** | `/concepts/dcf-valuation`, `/concepts/leveraged-buyouts` 200 with concept content. Note: `/concepts/dcf` alone is 404 (slug is `dcf-valuation`). |
| Weak-topic auto-focus + explanation | **Pass** | Dashboard / study / RAG show weak-topic chips with severity labels (“Currently focused weak topic”). |
| Diagrams + fallback | **Skip** | No critical diagram crash observed on smoked routes; dedicated diagram a11y fallback not exhaustively exercised. |
| Resource hyperlinks | **Pass** | Concept + study pages expose related concept / firm links in a11y tree. |
| Search / command palette | **Partial Fail** | `POST /api/search` **200** with hits. `GET /api/search?q=` **400** — `limit`/`offset` parsed as strings vs `z.number()` in `SearchRequestSchema`. No in-app command palette caller found yet; GET path still broken for curl/clients. |
| Question study | **Pass** | `/study` layered reveal controls (`Reveal next`, `Next question`) present and clickable. |
| Practice | **Pass (prod)** | `POST /api/practice/sessions` with `mode: adaptive_weak\|company\|concept\|pseudo_rag` → **201** on production (stub user). |
| Progress persists | **Skip** | Requires auth + DB mastery tables; Neon Auth unset / published views may be absent. |
| Admin review | **Skip** | Operator admin surface not required for Wave 3 product smoke; `/api/admin/status` not gate-blocking. |

## Page smoke

### Production

| Route | HTTP | Browser |
|-------|------|---------|
| `/` | 200 | Pass — h1 Editorial Finance Terminal |
| `/onboarding` | 200 | Pass |
| `/dashboard` | 200 | Pass |
| `/prep/heat` | 200 | Pass |
| `/prep/rag` | 200 | Pass |
| `/companies/goldman-sachs` | 200 | Pass |
| `/concepts/dcf-valuation` | 200 | Pass |
| `/study` | 200 | Pass |
| `/sign-in` | 200 | Pass |

### Local (`http://127.0.0.1:3000`)

Same routes **Pass** in browser (titles + interactive snapshots). Screenshots: `reports/qa-evidence/local_*.png`.

## API smoke

### Production

| Endpoint | Result | Notes |
|----------|--------|-------|
| `GET /api/health` | **Pass** 200 | `auth: stub`, `database: unavailable` |
| `GET /api/questions?limit=3` | **Pass** 200 | `bank_fallback` items |
| `POST /api/search` | **Pass** 200 | Hits for `q=dcf` |
| `GET /api/search?q=dcf` | **Fail** 400 | string limit/offset validation |
| `POST /api/practice/sessions` | **Pass** 201 | stub user when auth unset |
| `GET /api/practice/sessions` | **Skip** 405 | POST-only by design |
| `GET /api/firms/goldman-sachs/heat` | **Pass** 200 | stub empty topics when DB unset |
| `GET /api/auth/session` | **Skip** 503 | Neon Auth unset — expected |

### Local (this agent env)

`DATABASE_URL` was set in the process environment but published schema views were missing → several handlers returned **500** (`relation "published.v_questions" does not exist`) instead of bank_fallback. **Production** (no DB) correctly falls back. Treat local API 500s as env/migration gap, not a prod regression.

## Release gate (§45) — summary

| Item | Status |
|------|--------|
| Critical tests (product smoke + CLI) | **Pass** with noted Partial Fail on GET search |
| Accessibility checks | See `reports/accessibility-report.md` — **Pass w/ findings** |
| Performance checks | See `reports/performance-report.md` — **Pass** |
| Critical security findings | **None new** in smoke; auth stub returns 503 (safe fail-closed) |
| Documentation current | Status + these reports |
| Known limitations recorded | Below |

## Known limitations

1. **Neon Auth stub** — `/api/auth/*` 503 until `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` configured.
2. **bank_fallback without DATABASE_URL** — prod serves questions from bank JSON; firm heat empty stub.
3. **DATABASE_URL without migrations** — local can 500 on published views; prefer unset DB or apply migrations.
4. **GET `/api/search` coercion bug** — querystring limit/offset not coerced to numbers.
5. **Glassdoor scrape** — not required for product/release gates; worker secrets stay off Vercel.
6. **Progress / mastery persistence** — blocked on auth + DB.

## Merge gate notes

Do not merge Wave 3 “complete” on unit tests alone. Required evidence: this report + a11y + perf + CLI query OK + prod page smoke table green (auth 503 allowed).

## Evidence paths

- Screenshots: `reports/qa-evidence/`
- Re-run: `bash scripts/qa_product_smoke.sh`
