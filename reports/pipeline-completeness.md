# Pipeline completeness scoreboard

**Updated:** 2026-09-23 (generated from `exports/` by `ibpe_corpus.metrics.completeness`)  
**Contract:** [docs/data-pipeline.md](../docs/data-pipeline.md)  
**Plan:** docs/plans/2026-09-23-001-learning-loop-grading-retention-plan.md (C11–C14)

| ID | Dimension | Current | Target | Status | Blocker / note |
|----|-----------|---------|--------|--------|----------------|
| C1 | Teaching answer coverage | 666/666 (100.0%); placeholders 0 | 100% non-rejected, 0 placeholders | **green** | Placeholders withheld (`needs_generation`); remaining gaps need LLM/editorial answers |
| C2 | Teaching taxonomy | 539/666 (80.9%) topic + domain ∈ ib/pe/both | ≥80% | **green** | Heuristic enrich (rules v4 + source labels); 529 proposals pending review |
| C3 | Signal topic coverage | 72.7% of 3495 bank occurrences tagged (local export) | ≥70% | **green** | Keyword rules v4 in Python; LLM tagger when key exists |
| C4 | Signal↔teaching join | 31.6% joined (embedding 7, exact 16, fuzzy 826) | ≥25% | **green** | `exports/occurrence_joins.jsonl` → publish-teaching `--occurrence-joins` |
| C5 | PE breadth | domains {'ib': 425, 'both': 120, 'pe': 109, 'other': 12} | Thresholds in `pe_target_matrix.yml` | **watch** | See `reports/pe-coverage-report.md` |
| C6 | Mode B drills | Checkpoint seed 039 + runtime topic fill | ≥3 Qs per checkpoint in prod | **watch** | Curriculum track (P2.10) |
| C7 | Practice mode readiness | Mode pack builders + `rag` alias shipped | Dense `rag` in prod | **watch** | Run `embed:rag` (now embeds concepts + answer chunks) |
| C8 | License | Owner attestation 2026-09-23: permission for all listed sources | Cleared for prod expand | **green** | `reports/license-review.md` |
| C9 | LLM practice scoring | Grader wired (`llm`→`deterministic`→`self`) | `score_source=llm` in prod | **watch** | Needs GEMINI key |
| C10 | Diagram coverage | 040 adds WACC/MOIC/accretion/paper-LBO | Core concepts + embed a11y | **watch** | Diagram track |
| C11 | Rubric coverage | 666/666 (100.0%) approved rubrics | ≥90% publishable answers | **green** | Heuristic rubrics auto-approved only when validators pass (not human-reviewed) |
| C12 | Grader quality | not measured by content pipeline | Eval MAE ≤0.12, `correct` ≥90% | **watch** | Grader eval harness (P3.6) |
| C13 | Daily loop live | not measured by content pipeline | Daily set + streaks on in prod | **watch** | Retention track (Phases 4–6) |
| C14 | Drill coverage | not measured by content pipeline | ≥1 numeric drill template per core calc concept | **watch** | Drills track (P2.8); `calculators.py` exposes the parity functions |

## Content quality gates

| Gate | Dimension | Current | Target | Status |
|------|-----------|---------|--------|--------|
| Q-prefix | `Question N:` wordings | 0 | 0 | **green** |
| Depth | `expanded == concise` | 99 (14.9%) | <5% | **red** |
| Proposals | Enrichment proposals | 1610 (1081 auto-approved; {'approved': 1081, 'pending': 529}) | durable + reviewable | **green** |

## Mode readiness (product)

| Mode | Ready? | Why |
|------|--------|-----|
| `rag` (alias `pseudo_rag`) | partial | Pack freezes real/lexical RAG; prod dense key still env-dependent |
| `company` | partial | Heat-biased RAG pack + grader context; joins now exported with score/method |
| `concept` | partial | Checkpoint seed 039 + runtime fill; needs DB apply |
| `adaptive_weak` | partial | Weak mastery + topic fill; cold-start honest |
| `simulator` | partial | Stage topic map + heat bias; grader on attempts |

## Regenerate

```bash
PYTHONPATH=src python3 -m ibpe_corpus.cli run-pipeline --mode fixtures --force
PYTHONPATH=src python3 -m ibpe_corpus.metrics.completeness   # reports only, from exports
```
