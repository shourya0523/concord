# Front/back integration + data completeness audit

**Date:** 2026-08-01  
**Target:** https://concord-umber.vercel.app (Neon project `concord` / `steep-unit-18601062`)  
**Product thesis:** Mode A = company prep (Glassdoor firm signals × teaching Q/A); Mode B = concept labs (GitHub/curated answers + diagrams). Glassdoor prose is never teaching truth.

## Verdict

Wiring is **partially live**. Health, search, teaching Q/A, firm catalog, and learn shells work. Mode A heat was broken by a **published view drift** (fixed this run). Auth gates core prep pages. Learn drills have no linked questions. Glassdoor↔teaching join is empty. Worker/CLI env in this agent is incomplete.

## What works

| Check | Result |
|-------|--------|
| `GET /api/health` | `ok`, `auth: configured`, `database: configured` |
| Public pages `/`, `/dashboard`, `/study`, `/learn`, `/companies/goldman-sachs`, `/concepts/dcf-valuation` | 200 |
| `GET /api/questions` | **416** published teaching questions (`source: published`) |
| `GET /api/questions/:id?view=study` | Answers present (sampled 10/10) |
| `POST /api/search` | Hybrid RAG hits from `rag_documents` (416 embeddings present) |
| `GET /api/firms` | **42** firms with correct ids (`firm_goldman-sachs`, …) |
| `GET /api/firms/:id/signals` | Occurrence browser works; topics on rows |
| `GET /api/learn/modules` | **5** published modules |
| `GET /api/concepts` | **5** concepts (4 with diagrams/resources) |
| Neon answers | 416 rows (364 `source_provided`, 52 `synthesised_validated`) |
| Local bank | **3492** Glassdoor signals (IB-heavy); matches Neon occurrences |

## Not set up / broken

### P0 — product-breaking

1. **Mode A heat view drift (fixed 2026-08-01)**  
   Prod `published.v_firm_topic_heat` had still used `canonical_questions.topic` via join on `canonical_question_id`. **All 3492 occurrences have `canonical_question_id = NULL`**, so heat collapsed to a single `untagged` bucket per firm despite `question_occurrences.topic` being tagged (GS: behavioral 62 / valuation 50 / …).  
   **Fix applied:** recreated view per migration 034/`037_heat_view_occurrence_topic.sql`. APIs now return real topic heat.

2. **Neon Auth gates Mode A UI anonymously**  
   `apps/web/proxy.ts` protects `/prep/*`, `/api/practice/*`, etc. Anonymous `/prep/heat` and `/prep/rag` → **307 → /sign-in**. Smoke scripts still expect 200 → false FAIL. No authenticated test user in this run.

3. **Learn module drills empty**  
   All `learning_module_checkpoints.question_ids` are `[]` (seeded empty in 032). Mode B labs have lessons/diagrams but **no drill/quiz question linkage**.

4. **Glassdoor ↔ teaching join missing**  
   Occurrences never link to canonical teaching questions → `bank_signals` on study payloads empty; Mode A “heat ∩ teaching pack” cannot cite firm-specific matched Q/A, only lexical RAG.

### P1 — incomplete / misconfigured

5. **Topic coverage still thin**  
   After fix: 1272/3492 occurrences tagged; **2220 still `untagged`**. Teaching corpus: 217/416 questions have null topic; domain skew `other` 370 / `pe` 33 / `ib` 11.

6. **Firm id footguns**  
   Live catalog uses `firm_goldman-sachs` (hyphen). Underscore `firm_goldman_sachs` and mock ids (`firm_gs`, `firm_bx`) return empty heat. Mock journeys still use `firm_gs` etc.

7. **Auth session probe**  
   `GET /api/auth/session` → **404** (Neon Auth catch-all path differs; QA smoke assumes 200/503).

8. **Smoke scripts stale**  
   `scripts/prod_smoke.sh` / `qa_product_smoke.sh` assume stub-auth anonymous 200s on protected routes.

9. **Agent/worker local setup**  
   `.venv` missing `python-dotenv` → `python main.py query` fails. No `data/glassdoor_state.json`. `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, Upstash unset in this environment.

10. **Ops gaps (known)**  
    No Sentry/OTEL; Blob unverified; no authenticated E2E identity; Vercel CLI token historically broken (Git deploy works).

## Data completeness (product-aware)

| Layer | Count | Role | Completeness |
|-------|------:|------|--------------|
| Glassdoor bank / occurrences | 3492 | Mode A firm signals only | Volume OK; ~64% topic-untagged; 0 teaching links |
| Firms | 42 | Target catalog | OK for top IB/PE names |
| Teaching Q + answers | 416 / 416 | Mode B truth | Answers OK; domain/topic tags weak; IB under-labeled |
| RAG embeddings | 416 / 416 | Search / prep packs | Dense index present |
| Learning modules | 5 | Mode B path | Shell only — no checkpoint questions |
| Concepts / diagrams | 5 / 4 | Mode B visuals | Minimal starter set |
| PE bank signals | 101 PE + 37 VC | Mode A PE | Thin vs IB (2861) |

## Integration matrix (anonymous prod)

| Surface | Front | API/DB | Notes |
|---------|-------|--------|-------|
| Health | — | OK | Auth+DB configured |
| Study / search | OK | OK | Teaching answers via `?view=study` |
| Company page / signals | OK | OK | Topics on occurrences |
| Prep heat / RAG pages | Blocked (307) | API OK when called | Need sign-in |
| Practice / mastery / notes | Blocked | 307/401 | Expected with Neon Auth |
| Learn modules | OK shell | Empty drills | Data gap |
| CLI bank query | Fail here | Bank file OK | venv incomplete |

## Actions taken this run

1. Probed prod HTTP + Neon SQL against Mode A/B thesis.  
2. Recreated `published.v_firm_topic_heat` to prefer `o.topic` (verified GS multi-topic heat via API).  
3. Added idempotent `migrations/037_heat_view_occurrence_topic.sql` + migrate runner entry.

## Recommended next fixes

1. Seed checkpoint `question_ids` from published teaching Qs by concept/topic.  
2. Entity-link occurrences → nearest teaching canonical (or keep packs lexical but score by occurrence topic heat).  
3. Re-run / extend keyword topic backfill (036) for remaining untagged rows.  
4. Auth-aware smoke + test user; decide whether `/prep/*` should be public-read.  
5. Repair agent `.venv` (`bash .cursor/install.sh`) and document firm-id canonical form in contracts.
