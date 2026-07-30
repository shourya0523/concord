# ADR 0002 — Data thesis: GitHub teaching truth, Glassdoor firm signals

## Status

Accepted (Wave 1)

## Context

The product needs both high-quality interview answers and firm-specific practice focus. Glassdoor interview text is noisy, often incomplete, and not a reliable answer corpus. Curated open-source GitHub Q/A (and similar banks) already provide structured teaching content. Gemini can categorise and fill gaps but must not overwrite provenance.

## Decision

1. **GitHub / curated Q/A** = teaching source of truth for question wording + answers (`source_provided`, `corpus_matched`).
2. **Glassdoor** (`data/question_bank.json`, scrapers) = **firm signals only** — occurrences, topic heat, role/track frequency for Mode A company prep.
3. **Gemini** = enrichment (taxonomy tags, concept links, diagrams, synthesised drafts) with explicit `synthesised_*` / `gemini_synthesised` provenance.
4. Never label synthesised text as `source_provided`.
5. Product Mode A (company prep) joins Glassdoor heat → published GitHub/enriched Q/A; Mode B (concept labs) ignores firm heat by default.

## Consequences

- Importers in `src/ibpe_corpus/adapters/github/` are priority intake.
- Glassdoor scrape workstream must not invent answer pipelines from review text.
- Contracts separate `AnswerProvenance` (teaching) from occurrence/`Provenance` (learning packs).
- Database publish views must distinguish signal rows from teaching answers.
