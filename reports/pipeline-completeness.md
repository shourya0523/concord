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
| C6 | Mode B drills | Module checkpoints `question_ids=[]` | ≥3 Qs per checkpoint | **red** | Seed from published teaching |
| C7 | Practice mode readiness | Modes accepted; pack = `listQuestions`; enum still `pseudo_rag` | Mode builders; `rag` dense in prod | **red** | Rename + pack builders |
| C8 | License | High-priority sources BLOCKING | Cleared for prod expand | **red** | `reports/license-review.md` |
| C9 | LLM practice scoring | Self-rate confidence → mastery only | `score_source=llm` + rubric citations | **red** | Wire grader; teaching gold + heat context |
| C10 | Diagram coverage | Thin mermaid seed (035); few concept links | ≥1 mermaid per core concept + checkpoint links | **red** | Expand `diagram_versions`; embed a11y |

## Mode readiness (product)

| Mode | Ready? | Why |
|------|--------|-----|
| `rag` (alias `pseudo_rag`) | partial | Real embeddings path exists; naming + prod key / pack freeze incomplete |
| `company` | no | Heat works; not wired into practice pack/grade; joins empty |
| `concept` | no | Checkpoints empty; diagrams sparse |
| `adaptive_weak` | no | Needs mastery + recommender |
| `simulator` | partial | UI/session exist; stages static; self-score only |

## Regenerate

After `ibpe run-pipeline` / publish / topic backfill / diagram seed / grader ship, refresh this table from the cited sources.
