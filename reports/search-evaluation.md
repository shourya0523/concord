# Search evaluation (Wave 2 start)

Updated: 2026-07-30 · Branch: `local/ws-search-a9ff` · Package: `@ibpe/search`

## Scope

Evaluate hybrid retrieval + firm topic heat + **pseudo-RAG company packs**. Teaching truth = GitHub / static seed; Glassdoor = heat/signals only (ADR 0002 / 0006).

## Backend under test

| Component | Implementation |
|-----------|----------------|
| Lexical "FTS" | Token overlap (stopword-aware) |
| Trigram | Character 3-gram Jaccard (pg_trgm stand-in) |
| Vectors | Sparse bag-of-tokens cosine — **not** AI SDK `embed()` / Neon pgvector yet |
| Metadata | topic / domain / provenance / difficulty filters |
| Firm topic heat | Bank occurrence counts → `ln(n+1)/ln(50)` (matches `published.v_firm_topic_heat`) |
| Weakness | Explicit `weak_topics` boost |
| Live scrape | **Disabled** — fixtures / `data/question_bank.json` / exports only |

Neon FTS / `pg_trgm` / pgvector are **not provisioned** for this evaluation; in-memory hybrid is the documented Wave 2 default.

## Fixtures

- `packages/search/fixtures/teaching_seed.json` — 18 synthetic IB/PE Q/A (`static_seed`)
- `packages/search/fixtures/bank_slice.json` — 120 Glassdoor bank rows (signals)

## Smoke cases

| ID | Query / setup | Expectation | Result |
|----|---------------|-------------|--------|
| S1 | `three financial statements depreciation` + weak=`accounting` | Top hit accounting / statements; provenance ≠ glassdoor | PASS (unit) |
| S2 | Heat for `firm_goldman-sachs` + `firm_morgan-stanley` | Rows with `method=glassdoor_occurrence`, intensity ∈ [0,1] | PASS (unit) |
| S3 | Pack: GS+JPM, weak=`lbo`,`valuation`, prompt LBO/DCF | Frozen pack; every citation has provenance; explanations mention weak and/or heat | PASS (unit) |
| S4 | Recommend for GS + weak accounting | Reasons non-empty; grounded provenance | PASS (unit) |

## Pseudo-RAG pack checklist

- [x] Retrieve teaching corpus only
- [x] Filter/tier by heat ∩ weakness
- [x] Rerank with elevated heat/weakness weights
- [x] Freeze `PseudoRagPack` (`@ibpe/contracts`)
- [x] Cite every item (`github_source` | `static_seed` | …)
- [x] Explain weak-topic + heat hits in pack metadata
- [x] Refuse `glassdoor_occurrence` as pack teaching items

## Ranking quality (qualitative — seed corpus)

On the 18-item seed, lexical cues dominate for exact technical prompts (statements, DCF, LBO). Heat reranking matters more once the teaching set grows and firm×topic intensity differentiates Mode A rooms. Next eval wave should:

1. Build a 30–50 query gold set over `exports/questions.jsonl` + answers.
2. Measure nDCG@10 with/without heat and weakness ablations.
3. When Neon pgvector lands, A/B lexical-vector vs AI SDK embeddings (`embed` / `embedMany` via AI Gateway).

## Commands

```bash
npm test -w @ibpe/search
npm run demo -w @ibpe/search
```

## Risks / follow-ups

- Most `exports/questions.jsonl` rows still have `topic: null` — pack heat alignment depends on `inferTopic()` heuristics until taxonomy enrichment lands.
- Do not treat Glassdoor question prose as answer text in packs.
- Wire `@ibpe/search` into backend route handlers in a follow-up (owned by `ibpe-backend`).
