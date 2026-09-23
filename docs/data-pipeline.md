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
| Canonicalise | T vs S | Teaching fuzzy ≥92; signals exact-hash; `strip_question_prefix` before hashing; compound Qs with one paired source answer are never split | Keep split; never let bank volume disable teaching fuzzy |
| Join signals | S→T | `join_firm_signals`: exact → fuzzy 88 → hashing-embedding cosine ≥0.82; keyword rules v4 topic per signal (LLM tagger `signal-topic-v1` when keyed) → `exports/occurrence_joins.jsonl` | publish-teaching sets `canonical_question_id` / `join_score` / `join_method` / `topic` |
| Enrich taxonomy | T | `answers/taxonomy_enrich.py`: heuristic (source labels + rules v4 + source answer) or `enrich-v1`; durable proposals (SQLite `enrichment_proposals`, `exports/enrichment_proposals.jsonl`); auto-approve only rule-agreeing ≥0.8 | Human review of pending + 10% samples |
| Answer fill | T only | `fill_answers`: source → match → synth | Gemini enrich as optional post-step, not in fixture critical path |
| Validate | T only | Four validators + depth tag (`needs_expansion`); placeholders → `needs_generation` (withheld); source answers validated too | Re-run (or attest) before Neon stamp |
| Rubrics | T only | `answers/rubric.py` (`rubric-v1`): heuristic extractive / STAR, or LLM when keyed; validators gate `approved` | Human spot-check; grader reads `rubric_json` when `rubric_status='approved'` |
| Depth | T only | `answers/depth.py`: pending expansion proposals for shallow source answers | Editor approves → publish applies |
| Score quality | T | `JOB_NAMES` stub only | Implement or drop the name |
| Export | T/S | `export_all` → `exports/*.jsonl` + reports | Teaching JSONL ≠ firm_signals JSONL (already) |
| Publish | T | `npm run publish:teaching` (answers + `rubric_json`, proposals upsert/apply, occurrence joins, placeholder retire, `--retire-missing`) | Separate signal import path; never Glassdoor as answers |
| Embed | T | `npm run embed:rag` — kinds `canonical_question`, `answer_chunk` (~800 chars, de-duped vs concise), `concept`, `diagram`; re-embeds only changed content hashes | Cron after every teaching publish |

### Provenance hard rules

1. Glassdoor / `question_bank` → `product_role=firm_signal`, `contract_provenance=glassdoor_occurrence`.
2. Teaching answers → `github_source` | `static_seed` | `corpus_matched` | `synthesised_*` only.
3. Synthesised must never be labeled `source_provided` (validators enforce).
4. `[Interview process]` placeholders never publish (`publish_gate.py`).

### Commands

```bash
source .venv/bin/activate

# Assemble offline teaching + signal corpus (SQLite + exports/ + reports/)
ibpe run-pipeline --mode fixtures --force          # heuristic enrich/rubrics (no key)
ibpe run-pipeline --mode fixtures --force --llm    # Gemini enrich-v1 / rubric-v1 when keyed
PYTHONPATH=src python3 -m ibpe_corpus.metrics.completeness   # reports only, from exports
ibpe proposals --status pending                     # review queue
ibpe review-proposal <id> approved --reviewer you@example.com

# Live Glassdoor (worker / residential session) — signals only
python main.py login
python main.py batch --track PE --limit 1

# Publish teaching truth to Neon + RAG index
DATABASE_URL=… npm run publish:teaching -w @ibpe/database -- --retire-missing
DATABASE_URL=… GEMINI_API_KEY=… npm run embed:rag -w @ibpe/database
```

## Practice interviews (Lane P)

### Real RAG is the product path (retire “pseudo-RAG” as a mode)

We already ship **embedding-backed hybrid RAG** (`apps/web/lib/data/rag.ts` → `canonical.rag_documents` + `buildRealRagPack`). Lexical `buildPseudoRagPack` is a **fallback** when embeddings/API keys are missing — not a product mode.

| Today (debt) | Target |
|--------------|--------|
| Practice enum value `pseudo_rag` | Rename to `rag` (compat alias for one release) |
| UI/components named `PseudoRag*` | Cite cards become `RagCitation*` (or keep component id, change copy) |
| Session mode label implies fake retrieval | Mode means “freeze a cited RAG company pack” |

`company` and `rag` are related but not identical: **`rag`** = retrieval-first pack with citations; **`company`** = heat-ranked firm drill (may call the same retriever under the hood).

### Modes

| Mode | Intent | Pack source (target) | Completeness gate |
|------|--------|----------------------|-------------------|
| `company` | Mode A firm drills | Teaching Qs via heat × join × RAG re-rank | Firm heat present; pack ≥N teaching Qs |
| `concept` | Mode B labs | Module checkpoint `question_ids` / concept tags | Module checkpoints non-empty |
| `adaptive_weak` | Spaced weak topics | Mastery gaps × published bank (+ optional RAG) | Attempts exist **or** cold-start concept pack |
| `rag` (`pseudo_rag` alias) | Cited company prep pack | `/api/prep/rag` → `buildRealPrepRagPack` freeze | Dense embeddings green (lexical fallback allowed but labeled) |
| `simulator` | Timed multi-stage mock | Stage × firm track × heat-biased RAG | ≥1 teaching Q per stage |

### Scoring — LLM + firm context (not self-rate forever)

**Today:** attempts store self-rated `confidence` / `correct`; mastery = rolling score from that boolean. No rubric. No Glassdoor context in the score.

**Target attempt path:**

```text
response_text
  → load teaching Answer (concise + expanded + common mistakes)
  → load firm context pack (signals only):
        topic heat rows + occurrence snippets for firm_ids
        + RAG hits for this question/topic (teaching docs only)
  → Gemini structured grade (rubric):
        correctness 0–1, coverage of key points, red flags,
        firm_alignment note ("this firm heat skews to X — you missed…")
        citations restricted to teaching answer ids + heat topic ids
  → persist: self_score (optional), llm_score, rubric_json, weak_topics[]
  → mastery from llm_score (fallback to self if LLM unavailable)
```

Hard rules for the grader:

1. Glassdoor text is **context for weighting / coaching**, never the gold answer.
2. Every firm-specific claim in feedback must cite heat topic or occurrence id — same cite-only discipline as `rag-brief.ts`.
3. Numerical questions prefer deterministic checks from `calculation_representation` before/alongside LLM.
4. Fail open to self-score with `score_source=self` when `GEMINI_API_KEY` missing; never invent firm facts.

### Glassdoor leverage (efficient use)

Stop treating “messy join” as the only Mode A path. Use signals in three layers:

| Layer | Use | Not for |
|-------|-----|---------|
| Topic heat | Rank / bias packs + simulator stages | Answer wording |
| Occurrence snippets | Grader “firm asks a lot of X” coaching | Teaching truth |
| Join to teaching canonical | Deep link study cards when wording matches | Required for every pack item |

RAG already accepts `heat` into `searchCorpus` / `buildRealRagPack`. Wire that into **practice pack builders and the grader context**, not only `/prep/rag`.

### Session lifecycle

```text
request (mode, firm_ids?, concept_ids?, limit)
  → completeness gate (fail closed with typed ApiError if mode not ready)
  → pack builder (mode-specific; never bare listQuestions for named modes)
  → freeze question_ids + stage metadata + firm_context_snapshot on session
  → attempt → LLM/custom grade (above) → mastery upsert
```

**Implemented (this pass):** mode pack builders (`practice-packs.ts`); `rag` mode (+`pseudo_rag` alias); firm_context_snapshot on sessions; LLM/deterministic grader with heat citations; diagram seed 040 + embed path for diagram a11y.

**Still open:** prod dense-RAG key reliability; Neon occurrence→teaching join persistence; fail-closed API readiness endpoint; broader diagram↔concept graph.

### Diagrams (Mode B asset lane)

Schema exists: `canonical.diagrams` + `diagram_versions` (`format=mermaid|interactive-json`, body text). Seed is thin (~few mermaid flows in `035_diagram_resources_seed.sql`).

| Gap | Target |
|-----|--------|
| Few diagrams / weak concept links | Every core concept (DCF, LBO, 3-statement, WACC, …) has ≥1 published mermaid version |
| Enrich may invent diagrams without publish gate | Gemini diagram drafts → review → `diagram_versions` with provenance |
| Checkpoints reference empty `diagram_id` / drills | Module checkpoints point at real `diagram_id` + question_ids |
| RAG index ignores diagram a11y text | Embed diagram title + a11y_fallback into `rag_documents` for concept retrieval |

## Completeness model

Completeness is **product-aware**, not “row count went up.”

### Dimensions

| ID | Dimension | Green when | Measured by |
|----|-----------|------------|-------------|
| C1 | Teaching answer coverage | 100% of publishable Qs have non-rejected answers | `reports/answer-coverage-report.md` |
| C2 | Teaching taxonomy | ≥80% publishable Qs have topic + domain ∈ {ib,pe,both} | DQ report / Neon SQL |
| C3 | Signal topic coverage | ≥70% occurrences topic-tagged (not `untagged`) | Heat + bank backfill metrics |
| C4 | Signal↔teaching join | ≥25% occurrences link a teaching canonical **or** heat-biased RAG pack path live | Join audits + Neon `canonical_question_id` |
| C5 | PE breadth | Thresholds in `config/pe_target_matrix.yml` | `reports/pe-coverage-report.md` |
| C6 | Mode B drills | Every published module checkpoint has ≥3 `question_ids` | Neon `learning_module_checkpoints` |
| C7 | Practice mode readiness | Gates in the mode table above pass; `rag` uses dense backend in prod | Integration audit + API readiness |
| C8 | License | High-priority GitHub sources cleared | `reports/license-review.md` |
| C9 | LLM practice scoring | ≥1 firm simulator/company attempt path returns `score_source=llm` with citations | Attempt API / eval fixture |
| C10 | Diagram coverage | Core concepts each have ≥1 mermaid `diagram_versions` row linked from modules | Neon diagram + checkpoint SQL |
| C11 | Rubric coverage | ≥90% publishable answers have an approved `rubric_json` | `reports/answer-coverage-report.md` |
| C12 | Grader quality | Eval MAE ≤0.12, `correct` accuracy ≥90% on the gold set | Grader eval harness |
| C13 | Daily loop live | Daily set + streak engine on in prod; notification idempotency verified | Product checks |
| C14 | Drill coverage | Every core calc concept has ≥1 numeric drill template with calculator parity tests | Drill registry + tests |

### Scoreboard

`reports/pipeline-completeness.md` is regenerated from the exports on every `run-pipeline` (and by `python -m ibpe_corpus.metrics.completeness`); never hand-edit it. Columns: dimension, current, target, status, blocker.

Product UI / APIs may expose a slim readiness payload later (`GET /api/admin/pipeline-readiness`) — not required for Lane T/S offline runs.

### Fail-closed publish

| Gate | Blocks |
|------|--------|
| Placeholders / topic_signal in teaching export | `questions.jsonl` publish |
| License BLOCKING (high-priority) | Expanding production teaching corpus (cleared by owner attestation 2026-09-23) |
| Generic placeholder answer / `needs_generation` | That answer (withheld; publish-teaching retires old rows) |
| Answer `rejected` / empty | That question's publishable flag |
| Module checkpoints empty | `concept` mode start (API 422 typed) |
| Firm heat empty + no RAG | `company` / `simulator` start for that firm |

## Content enrichment stages (plan 2026-09-23-001)

Order inside `run_fixture_pipeline` (offline, no key needed):

1. **Import** — seed, behavioural seed (`fixtures/corpus/behavioural_seed.json`, 60 synthesised fit Qs), GitHub sources (ddeng5, coryjburk IB/PE playbooks, offergenie, HireAbo), bank signals.
2. **Canonicalise** — `strip_question_prefix` on wording + hash; paired compound questions stay whole. Stable ids: prior `exports/*.jsonl` act as the id registry so published ids survive re-runs.
3. **Signal join** — topic tag + exact/fuzzy/embedding join (`occurrence_joins.jsonl`).
4. **Taxonomy enrichment** — proposals persisted; approved rows applied before answers are routed.
5. **Answers** — source → corpus match → topic synthesis (18 handlers + facets); generic placeholder is `needs_generation` and withheld.
6. **Validate** — incl. `needs_expansion` tag; source answers validated too.
7. **Rubrics** — `rubric-v1` on every answer (heuristic unless keyed); `review_status` from validators.
8. **Depth proposals** — synthesised appendices for shallow source answers, pending editor approval.
9. **Export + reports** — `answers.jsonl` carries `rubric`, `quality_tags`, `coaching_notes`; reports are computed from exports.

Honesty notes: heuristic taxonomy auto-approvals and heuristic rubrics are **rule-validated, not human-reviewed**; ~10% of auto-approvals are queued as review samples. Gemini paths (`enrich-v1`, `rubric-v1`, `signal-topic-v1`) run only with `GEMINI_API_KEY` / `AI_GATEWAY_API_KEY` and fall back to heuristics on any failure.

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
