# ADR 0007 — Licensed guides as primary teaching truth

## Status

Accepted (supersedes ADR 0002 teaching-truth clause)

## Context

Concord now has redistribution rights for two commercial IB interview guides:

- **BIWS 400 Questions** (2025/2026 edition)
- **M&I 400 Investment Banking Questions**

These provide higher-quality, complete Q&A than scraped Glassdoor text or fragmented GitHub corpora. Glassdoor remains valuable for firm-specific topic heat and supplemental retrieval context.

## Decision

1. **Licensed guides** (`licensed_guide`) = **sole primary teaching truth** for published question wording and `source_provided` answers.
2. **GitHub / static seed** = **RAG supplemental context only** (`product_role=rag_context`); not published as primary teaching rows.
3. **Glassdoor** (`data/question_bank.json`) = **firm signals** (occurrences, topic heat) **plus** RAG supplemental question wordings — never teaching answers.
4. **Gemini** = enrichment / gap-fill over RAG context with explicit `gemini_synthesised` / `synthesised_*` provenance.
5. Never label synthesised or RAG-grounded text as `source_provided`.
6. Mode A (company prep) joins Glassdoor heat → published guide Q&A; Mode B (concept labs) uses guide corpus by default.

## Consequences

- Guide importers in `src/ibpe_corpus/adapters/guides/` are priority intake for teaching publish.
- `publish-teaching` allowlists `licensed_guide` provenance for new teaching rows.
- GitHub importers remain for RAG indexing and enrichment retrieval.
- ADR 0002 Glassdoor + Gemini clauses remain; GitHub teaching-truth clause is superseded.
