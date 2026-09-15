# Pipeline completeness scoreboard

**Updated:** 2026-08-01  
**Contract:** [docs/data-pipeline.md](../docs/data-pipeline.md)  
**Sources:** DQ / answer / PE reports, integration audit, license-review, diagram seed 035

| ID | Dimension | Current | Target | Status | Blocker / note |
|----|-----------|--------:|--------|--------|----------------|
| C1 | Teaching answer coverage | 416/416 publishable answered | 100% non-rejected | **green** | Keep on every export |
| C2 | Teaching taxonomy | topic null ~217/416; domain mostly `other` | ≥80% topic + domain ∈ {ib,pe,both} | **red** | Backfill / enrich tags |
| C3 | Signal topic coverage | ~1272–1600 / 3492 tagged | ≥70% | **red** | Keyword rules v2 + backfill 036 |
| C4 | Signal↔teaching join | Prod `canonical_question_id` often null; local joins ~738 | Join tracked; Mode A OK via heat-biased real RAG | **red** | Persist joins; ship heat→RAG packs now |
| C5 | PE breadth | Matrix checks via pe-coverage-report | Thresholds in `pe_target_matrix.yml` | **watch** | PE signals thin vs IB |
| C6 | Mode B drills | Checkpoint seed 039 + runtime topic fill | ≥3 Qs per checkpoint in prod | **watch** | Apply/verify on Neon |
| C7 | Practice mode readiness | Mode pack builders + `rag` alias shipped | Dense `rag` in prod | **watch** | Prod smoke with firm heat |
| C8 | License | High-priority sources BLOCKING | Cleared for prod expand | **red** | `reports/license-review.md` |
| C9 | LLM practice scoring | Grader wired (`llm`→`deterministic`→`self`) | `score_source=llm` in prod | **watch** | Needs GEMINI + response_text attempts |
| C10 | Diagram coverage | 040 adds WACC/MOIC/accretion/paper-LBO | Core concepts + embed a11y | **watch** | Apply 040; run embed:rag |

## Mode readiness (product)

| Mode | Ready? | Why |
|------|--------|-----|
| `rag` (alias `pseudo_rag`) | partial | Pack freezes real/lexical RAG; prod dense key still env-dependent |
| `company` | partial | Heat-biased RAG pack + grader context; joins still thin |
| `concept` | partial | Checkpoint seed 039 + runtime fill; needs DB apply |
| `adaptive_weak` | partial | Weak mastery + topic fill; cold-start honest |
| `simulator` | partial | Stage topic map + heat bias; grader on attempts |

## Regenerate

After `ibpe run-pipeline` / publish / topic backfill / diagram seed / grader ship, refresh this table from the cited sources.
