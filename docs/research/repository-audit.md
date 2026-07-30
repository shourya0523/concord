# Repository audit — GlassCleaner2 / Concord baseline

**Date:** 2026-07-30  
**Auditor:** Workstream A (`ibpe-architecture`)  
**Baseline commit:** `e17ea78` (`origin/main`)  
**Compared to:** `docs/prompts/autonomous-fullstack-build.md` §0

## Verdict

The repo is a **working Python scraper + Flask bank UI + absorbed `ibpe_corpus` pipeline**, with Phase 0 monorepo stubs. It is **not** yet a shipped Next.js product. Prompt §0 is largely accurate; several counts and merge statuses are **stale** and updated below.

## §0 claim vs observed (2026-07-30)

| §0 claim | Observed on `main` @ e17ea78+ | Delta |
|----------|-------------------------------|-------|
| Python 3.12, `.venv`, `requirements.txt` | Present | OK |
| CLI `python main.py` login/batch/query/ui | Present | OK — **must preserve** |
| Browser scrape Selenium/SeleniumBase + Patchright state | Present under `scrapers/` | OK |
| BFF `scrapers/bff_api.py` + `batch --backend bff` | Present (PR #5 merged) | OK — do not re-implement |
| Parallel batch `scripts/parallel_batch.py` | Present on main | §0 said “unmerged / PR #7 open” — **now on trunk** |
| Question bank ~2,842 Q / 52 jobs / 21 companies | **3,492 Q / 105 completed_jobs / 42 companies** | **Stale** — bank grew |
| Tracks IB-heavy, PE thin | IB 2861 · Banking 493 · PE 101 · VC 37 | PE still thin vs IB |
| Dedup SHA1 `company\|position\|question` | `scrapers/bank.py` | OK |
| `config/targets.json` firm list | Present | OK |
| Flask `web/` on :5050 | Present | Interim only |
| `ibpe_corpus` / GitHub adapters | Present under `src/ibpe_corpus/` | §0 “unmerged PR #2” — **absorbed on main** |
| Tests / CI / Next.js app / Vercel | Absent as product | Phase 0 stubs only (`apps/*`, `packages/*`) |
| Monorepo `apps/`, `packages/` | Scaffold READMEs + Phase 0 contracts | Expanding in Wave 1 A |

### Bank file shape (confirmed)

Top-level keys: `version`, `updated_at`, `questions`, `completed_jobs`.

Question fields: `id`, `company`, `track`, `position`, `date_posted`, `user`, `experience`, `question`, `process`, `scraped_at`.

Completed job fields observed: `company`, `position`, `track`, `completed_at` (no `backend` yet on disk — schema allows optional).

## Operational constraints (still true)

1. Datacenter IPs hit Cloudflare on Indeed Google OAuth.
2. Preferred cloud scrape: `python main.py batch --backend bff` + residential `HTTPS_PROXY`.
3. Preferred interactive session: `python main.py login` → `data/glassdoor_state.json`.
4. Without residential proxy, BFF interview calls often Cloudflare 403.
5. Secrets: `GLASSDOOR_*`, `HTTPS_PROXY`, `CAPSOLVER_API_KEY`, `GEMINI_API_KEY` — never `NEXT_PUBLIC_*`.

## Sibling / absorb status (refresh)

| Item | Status |
|------|--------|
| PR #5 BFF | Merged — on main |
| PR #7 parallel batch | Script on main; parallel runner still browser-oriented (BFF parity = glassdoor stream) |
| PR #2 corpus | Absorbed — `src/ibpe_corpus/`, `config/github_sources.yml`, taxonomy YAML |

## Architecture implications

1. **Teaching truth** already has a path via `ibpe_corpus` GitHub adapters — prioritise import/publish over scraping answers from Glassdoor.
2. **Firm signals** continue via bank + scrapers; map bank rows → `InterviewOccurrence` + `TopicHeat`.
3. **Monorepo cutover** is evolutionary: keep `main.py`, add `apps/web` + `packages/*` around it (ADR 0001/0004).
4. **Storage target:** Neon + Blob + Upstash (ADR 0003); local SQLite remains for corpus until cutover.
5. **Contracts:** Zod in `packages/contracts` expanded Wave 1; mirror Pydantic in `src/ibpe_corpus/schemas/models.py`.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bank PII-ish usernames / free-text in JSON | Med | Treat bank as internal; redact on publish |
| Cloudflare blocks scrape progress | High | BFF + proxy; fixtures for CI |
| PE coverage gap (101 vs 2861 IB) | High | Glassdoor PE targets + GitHub PE sources |
| Dual schema drift (Zod vs Pydantic) | Med | ADR 0005; hand-sync Wave 1 |
| Accidental scrape in serverless | High | Workers only; ADR 0004 |

## Migration recommendations

1. Idempotent importer: `question_bank.json` → staging → canonical + occurrences (preserve SHA1 ids).
2. Publish views for product; stop reading bank JSON from Next.js in production.
3. Flask remains operator UI until Wave 2 Next.js company rooms / concept labs ship.
4. Expand PE via taxonomy + target matrix already in `config/`.

## Parallelisation map (Wave 1)

| Stream | Unblocked by this audit |
|--------|-------------------------|
| Design system | `packages/ui` stub ready |
| Database | Contracts + bank shape frozen |
| Glassdoor | Signal-only mandate clear; BFF exists |
| Data quality | GitHub path on main |
| Answers | Answer + provenance contracts |
| Infra | Env inventory + storage ADRs |

## Explicit non-goals (this stream)

- No scrape UI / frontend features
- No Drizzle schema ownership (database stream)
- No shadcn visual system (design-system stream)
