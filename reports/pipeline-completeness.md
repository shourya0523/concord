# Pipeline completeness scoreboard

**Updated:** 2026-08-01  
**Contract:** [docs/data-pipeline.md](../docs/data-pipeline.md)  
**Sources:** `reports/data-quality-report.md`, `answer-coverage-report.md`, `pe-coverage-report.md`, `integration-audit-2026-08-01.md`, `license-review.md`

| ID | Dimension | Current | Target | Status | Blocker / note |
|----|-----------|--------:|--------|--------|----------------|
| C1 | Teaching answer coverage | 416/416 publishable answered | 100% non-rejected | **green** | Keep on every export |
| C2 | Teaching taxonomy | topic null ~217/416; domain mostly `other` | ≥80% topic + domain ∈ {ib,pe,both} | **red** | Backfill / enrich tags |
| C3 | Signal topic coverage | ~1272–1600 / 3492 tagged | ≥70% | **red** | Keyword rules v2 + backfill 036 |
| C4 | Signal↔teaching join | Prod occurrences often `canonical_question_id` null; local join audits ~738 | ≥25% linked **or** labeled heat-only path | **red** | Persist joins on Neon publish/import |
| C5 | PE breadth | Matrix checks via pe-coverage-report | Thresholds in `pe_target_matrix.yml` | **watch** | PE signals thin vs IB |
| C6 | Mode B drills | Module checkpoints `question_ids=[]` | ≥3 Qs per checkpoint | **red** | Seed from published teaching by concept |
| C7 | Practice mode readiness | Modes accepted; pack = `listQuestions` fallback | Mode-specific builders + fail-closed gates | **red** | Lane P pack builders |
| C8 | License | High-priority sources BLOCKING | Cleared for prod expand | **red** | `reports/license-review.md` |

## Mode readiness (product)

| Mode | Ready? | Why |
|------|--------|-----|
| `pseudo_rag` | partial | 416 embeddings; auth may gate prep UI |
| `company` | no | Heat works after view fix; teaching join empty → packs not firm-true |
| `concept` | no | Checkpoints empty |
| `adaptive_weak` | no | Needs mastery history + weak-topic recommender wiring |
| `simulator` | partial | UI + session API exist; stages static; questions not stage-aware |

## Regenerate

After `ibpe run-pipeline` / publish / topic backfill, refresh this table from the cited reports (manual OK until a script owns it).
