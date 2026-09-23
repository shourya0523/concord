# License review — GitHub teaching corpora

**Status: CLEARED by owner attestation (2026-09-23).** The repository owner confirmed
permission to use all listed teaching sources. This report is generated from
`config/github_sources.yml` — edit the config, not this file.

## Owner attestation

- **Date:** 2026-09-23
- **Attested by:** repository owner (Concord)
- **Scope:** All sources below with product_role teaching_qa (ddeng5/Capital-Markets-Question-Bank-App, coryjburk/intv-playbook-ib_vc, coryjburk/intv-playbook-pe_vc, HireAbo/awesome-interview-questions-5000-jobs, offergenieai/Finance-Interview-Questions).
- **Statement:** The repository owner confirmed on 2026-09-23 that Concord has permission to use all listed sources for the teaching corpus. Attribution is kept on answer provenance (source_ids, source artefact URLs).
- **Recorded by:** content track (plan 2026-09-23-001, OQ-1 / P1.1)

Attestation is the owner's representation; it does not replace an upstream SPDX
licence. Keep attribution on published provenance and revisit if a source adds
restrictive terms.

| Source | Commit | Product role | Imported content | Decision |
|--------|--------|--------------|------------------|----------|
| `ddeng5/Capital-Markets-Question-Bank-App` | `05dca576…` | `teaching_qa` | 385 IB question/answer pairs (Firebase export) | **permission granted by owner** |
| `HireAbo/awesome-interview-questions-5000-jobs` | `837a40fb…` | `teaching_qa` | 15 question titles (5 per IB / PE / M&A file), no answers — answers synthesised | **permission granted by owner** |
| `offergenieai/Finance-Interview-Questions` | `03f814c1…` | `teaching_qa` | 20 JPMorgan / Goldman question titles with category + difficulty, no answers — answers synthesised | **permission granted by owner** |
| `coryjburk/intv-playbook-ib_vc` | `849a2b08…` | `teaching_qa` | 100 IB questions — model answer, deep dive, coaching note, red flag, category, difficulty | **permission granted by owner** |
| `coryjburk/intv-playbook-pe_vc` | `d3f524b2…` | `teaching_qa` | 100 PE / portfolio-operations questions — model answer, deep dive, coaching note, red flag, category, difficulty | **permission granted by owner** |
| Static seed (`fixtures/corpus/seed_ib_pe_questions.json`) | n/a | `teaching_qa` | Synthetic in-repo fixture | **Allowed (synthetic)** |
| Behavioural seed (`fixtures/corpus/behavioural_seed.json`) | n/a | `teaching_qa` | Synthesised coaching guidance (not Glassdoor) | **Allowed (synthetic)** |
| `data/question_bank.json` | n/a | `firm_signal` | Occurrence heat only — never teaching answers | **Signal-only (no teaching publish)** |

## Pattern-only / not imported

- `Marvin-Deng/Interview-Scraper` — `pattern_only` (pattern_only)
- `franziskavonalbedyll/GlassdoorInterviewExpert` — `pattern_only` (pattern_only)
- `williamxie11/glassdoor-interview-scraper` — `pattern_only` (pattern_only)
- `jarus-singh/Glassdoor-Interview-Scraper` — `no` (pattern_only)
- `raghuboosetty/glassdoor-interview-questions-scrapper` — `no` (pattern_only)
- `mikinty/Trading-Interview-Questions` — `pattern_only` (pattern_only)

## Gate

- [x] Owner signs off listed GitHub teaching sources (2026-09-23)
- [x] Attribution recorded on answer provenance (`source_ids`, source artefact URLs)
- [x] Pattern-only scraper repos remain non-imported
- [x] `[Interview process]` placeholders absent from published exports

## References

- `config/github_sources.yml`
- `docs/source-registry.md`
- `packages/contracts` `ProvenanceEnum` (`github_source` | `static_seed` | `glassdoor_occurrence` | …)
