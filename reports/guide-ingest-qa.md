# Guide ingest QA — BIWS 400 (2026) + M&I 400 IB

Generated during PDF primary teaching corpus implementation.

| Metric | Value |
|--------|-------|
| BIWS + M&I pairs extracted | 556 |
| After cross-guide dedupe (BIWS priority) | ~535 |
| Published teaching export (`questions.jsonl`) | 535 |
| RAG supplemental (`rag_context.jsonl`) | GitHub + seed + Glassdoor wordings |
| Teaching provenance | `licensed_guide` |
| GitHub/static product role | `rag_context` |

## Spot checks

- Behavioral: "Walk me through your resume / Why are you here today?" — licensed_guide
- Technical: DCF / three-statements items present with source-provided answers
- GitHub Capital Markets export rows appear in `rag_context.jsonl`, not `questions.jsonl`

## Commands

```bash
# Copy PDFs to data/guides/ (gitignored), then:
PYTHONPATH=src python -c "from ibpe_corpus.adapters.guides import load_all_guides; print(load_all_guides().metrics)"

# Full offline pipeline → exports/
PYTHONPATH=src python -c "from ibpe_corpus.orchestration.pipeline import run_fixture_pipeline; run_fixture_pipeline()"

# Publish (requires DATABASE_URL)
npm run publish:teaching -w @ibpe/database
```
