# Data pipeline

How Concord turns raw sources into **teachable questions**, **firm signals**, and **practice-ready sessions** — and how we know the corpus is complete enough to ship.

> **Thesis (ADR 0002):** GitHub/curated Q/A = teaching truth. Glassdoor = firm signals only. Gemini = enrich with explicit synthesised provenance. Never treat Glassdoor review prose as answers.

## Three lanes (not one conveyor)

The architecture diagram once implied a single stage chain. In practice the product needs **three lanes** that share contracts but have different SLAs and publish gates.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ LANE T — Teaching truth                                                  │
│ GitHub / seed → extract → classify → canonicalise (fuzzy)                │
│   → answer (source → match → synth) → validate → export JSONL            │
│   → publish:teaching (Neon) → embed:rag                                  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ LANE S — Firm signals                                                    │
│ Glassdoor scrape / question_bank → extract as topic_signal               │
│   → canonicalise (exact-hash) → topic tag → join_firm_signals            │
│   → Neon occurrences + heat views (never answers)                        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ LANE P — Practice / product                                              │
│ Published teaching + heat + mastery → mode pack builder                  │
│   → freeze session membership → attempts → mastery                       │
│ Completeness gates decide which modes may start.                         │
└──────────────────────────────────────────────────────────────────────────┘
```

| Lane | Owner streams | Success metric |
|------|---------------|----------------|
| **T** | data-quality, answers, database | Publishable Q = answered + validated; provenance honest |
| **S** | glassdoor, data-quality | Occurrences topic-tagged; heat useful; joins onto teaching where wording matches |
| **P** | backend, search, frontend | Mode-aware packs; modules have drills; simulator stages not forever-static |

## Question processing (Lane T + S)

### Stage map (canonical)

| Stage | Lane | Implementation today | Target |
|-------|------|----------------------|--------|
| Discover | T/S | GitHub registry + bank import; live Glassdoor separate CLI | Keep; emit `JobEvent` progress |
| Fetch / archive | S | Patchright `login` + `batch`; fixtures offline | Worker-hosted only; Blob for raw HTML |
| Extract | T/S | GitHub importers; Glassdoor parse → `ExtractedRecord` | Unchanged semantics (`docs/extraction.md`) |
| Classify PE | T/S | `pe/classifier.py` on role metadata | Also tag teaching domain IB/PE (today skewed `other`) |
| Canonicalise | T vs S | Teaching fuzzy ≥92; signals exact-hash | Keep split; never let bank volume disable teaching fuzzy |
| Join signals | S→T | `join_firm_signals` (fuzzy 88) | Persist `canonical_question_id` on Neon occurrences (today often null in prod) |
| Answer fill | T only | `fill_answers`: source → match → synth | Gemini enrich as optional post-step, not in fixture critical path |
| Validate | T only | Four Python validators | Re-run (or attest) before Neon stamp; stop blind `validated` stamp |
| Score quality | T | `JOB_NAMES` stub only | Implement or drop the name |
| Export | T/S | `export_all` → `exports/*.jsonl` + reports | Teaching JSONL ≠ firm_signals JSONL (already) |
| Publish | T | `npm run publish:teaching` | Separate signal import path; never Glassdoor as answers |
| Embed | T | `npm run embed:rag` | Cron after every teaching publish |

### Provenance hard rules

1. Glassdoor / `question_bank` → `product_role=firm_signal`, `contract_provenance=glassdoor_occurrence`.
2. Teaching answers → `github_source` | `static_seed` | `corpus_matched` | `synthesised_*` only.
3. Synthesised must never be labeled `source_provided` (validators enforce).
4. `[Interview process]` placeholders never publish (`publish_gate.py`).

### Commands

```bash
source .venv/bin/activate

# Assemble offline teaching + signal corpus (SQLite + exports/)
ibpe run-pipeline --mode fixtures

# Live Glassdoor (worker / residential session) — signals only
python main.py login
python main.py batch --track PE --limit 1

# Publish teaching truth to Neon + RAG index
DATABASE_URL=… npm run publish:teaching -w @ibpe/database
DATABASE_URL=… GEMINI_API_KEY=… npm run embed:rag -w @ibpe/database
```

## Practice interviews (Lane P)

### Modes

| Mode | Intent | Pack source (target) | Completeness gate |
|------|--------|----------------------|-------------------|
| `company` | Mode A firm prep | Teaching Qs ranked by firm heat ∩ topic join | Firm has heat topics; ≥N joinable teaching Qs **or** lexical RAG fallback labeled as such |
| `concept` | Mode B labs | Module checkpoint `question_ids` / concept tags | Module checkpoints non-empty |
| `adaptive_weak` | Spaced weak topics | Mastery gaps × published bank | User has ≥1 attempt history **or** cold-start concept pack |
| `pseudo_rag` | Cited company pack | `/api/prep/rag` retrieval freeze | RAG embeddings present for published bank |
| `simulator` | Timed multi-stage mock | Stage template × firm track (IB/PE) | Stage→topic map resolved; questions per stage ≥1 |

### Session lifecycle

```text
request (mode, firm_ids?, concept_ids?, limit)
  → completeness gate (fail closed with typed ApiError if mode not ready)
  → pack builder (mode-specific; never bare listQuestions default for named modes)
  → freeze question_ids + stage metadata on study_sessions.metadata_json
  → attempts (response_text, confidence, correct?, time_spent_ms)
  → mastery upsert
```

**Today's gap:** `createPracticeSession` falls back to `listQuestions` for any empty `question_ids`, so mode labels do not change selection. Simulator stages are a static IB/PE template. Attempts are mostly self-rated confidence.

**Target:** each mode has a dedicated pack builder in `apps/web/lib/data/` (or `@ibpe/search` recommenders). Freeze membership at start. Simulator may keep self-rating until an optional rubric scorer lands — but stages must pull real topic-tagged teaching Qs.

## Completeness model

Completeness is **product-aware**, not “row count went up.”

### Dimensions

| ID | Dimension | Green when | Measured by |
|----|-----------|------------|-------------|
| C1 | Teaching answer coverage | 100% of publishable Qs have non-rejected answers | `reports/answer-coverage-report.md` |
| C2 | Teaching taxonomy | ≥80% publishable Qs have topic + domain ∈ {ib,pe,both} | DQ report / Neon SQL |
| C3 | Signal topic coverage | ≥70% occurrences topic-tagged (not `untagged`) | Heat + bank backfill metrics |
| C4 | Signal↔teaching join | ≥25% occurrences link a teaching canonical **or** explicit “heat-only” product path | Join audits + Neon `canonical_question_id` |
| C5 | PE breadth | Thresholds in `config/pe_target_matrix.yml` | `reports/pe-coverage-report.md` |
| C6 | Mode B drills | Every published module checkpoint has ≥3 `question_ids` | Neon `learning_module_checkpoints` |
| C7 | Practice mode readiness | Gates in the mode table above pass | Integration audit + API readiness endpoint |
| C8 | License | High-priority GitHub sources cleared | `reports/license-review.md` |

### Scoreboard

Maintain one living table in `reports/pipeline-completeness.md` (regenerated by export or a small script). Columns: dimension, current, target, status, blocker.

Product UI / APIs may expose a slim readiness payload later (`GET /api/admin/pipeline-readiness`) — not required for Lane T/S offline runs.

### Fail-closed publish

| Gate | Blocks |
|------|--------|
| Placeholders / topic_signal in teaching export | `questions.jsonl` publish |
| License BLOCKING (high-priority) | Expanding production teaching corpus |
| Answer `rejected` / empty | That question's publishable flag |
| Module checkpoints empty | `concept` mode start (API 422 typed) |
| Firm heat empty + no RAG | `company` / `simulator` start for that firm |

## Job orchestration (honest catalog)

`JOB_NAMES` in `ibpe_corpus.orchestration.jobs` lists many stages. Only a subset runs inside `run_fixture_pipeline`. Rule going forward:

1. **Executed jobs** must match a lane stage above.
2. Unused names are either wired, renamed, or removed in the next orchestration pass — no shadow catalog.
3. Collapsed jobs (`answers:fill+validate:v2`) stay collapsed if atomic; document the composite key.
4. Neon publish + embed are **post-export worker steps**, not pretend Python jobs.

Workers (`apps/worker`) host: scrape enqueue, `run-pipeline`, Gemini enrich, `publish:teaching`, `embed:rag`. Never long scrapes inside Vercel request timeouts.

## Related docs

- [architecture.md](./architecture.md) — system context + thesis
- [data-model.md](./data-model.md) — entities
- [extraction.md](./extraction.md) / [deduplication.md](./deduplication.md)
- [answer-generation.md](./answer-generation.md) / [answer-validation.md](./answer-validation.md)
- [private-equity-coverage.md](./private-equity-coverage.md)
- [decisions/0002-data-thesis-github-glassdoor-gemini.md](./decisions/0002-data-thesis-github-glassdoor-gemini.md)
- Plan: [plans/2026-08-01-001-architecture-data-pipeline-rethink-plan.md](./plans/2026-08-01-001-architecture-data-pipeline-rethink-plan.md)
