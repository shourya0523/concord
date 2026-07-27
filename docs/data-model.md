# Data Model

Shared Pydantic schemas live in `src/ibpe_corpus/schemas/models.py`.
SQLite persistence is defined in `src/ibpe_corpus/storage/db.py` and mirrored
additively by `migrations/001_init.sql`.

## Entity overview

```
RawArtefact
    └── ExtractedRecord          (grounded source span)
            └── QuestionVariant  (source wording + normalised_hash)
                    ├── CanonicalQuestion   (deduplicated)
                    └── InterviewOccurrence (employer / role / round …)
CanonicalQuestion
    ├── Answer
    └── question_relationships (prerequisite | follow_up | related | duplicate_candidate)
```

## Core tables / models

| Model | Table | Purpose |
|-------|-------|---------|
| `RawArtefact` | `source_artefacts` | Fetched HTML/JSON artefact with content hash + access state |
| `ExtractedRecord` | `raw_records` | Grounded extraction span + `ExtractionClass` |
| `CanonicalQuestion` | `canonical_questions` | Deduplicated interview question; `domain`, `pe_relevance` |
| `QuestionVariant` | `question_variants` | Exact / paraphrase / topic_signal / numerical wording |
| `InterviewOccurrence` | `interview_occurrences` | Where/when a variant was asked |
| `QuestionResponse` | `question_responses` | Glassdoor comments/answers as child resources |
| `Answer` | `answers` | Layered answers with provenance |
| — | `question_relationships` | Graph edges between canonical questions |
| — | `merge_audit` | Reversible dedup decisions |
| `JobResult` | `jobs` | Idempotent job state |
| `DeadLetter` | `dead_letters` | Failed payloads |

## Enums used by canonicalisation

**`Domain`:** `ib` | `pe` | `both` | `other`

**`PERelevance`:** `core_pe_investing` | `adjacent_pe_investing` |
`portfolio_operations` | `allocator_or_fund_selection` | `pe_advisory` |
`fund_operations` | `not_pe`

**`ExtractionClass` (question-like subset):** `exact_question` |
`paraphrased_question` | `topic_signal`

## Variant types

`QuestionVariant.variant_type`:

- `exact` — verbatim interview question
- `paraphrase` — same intent, different wording
- `topic_signal` — topic mention only (not interview wording)
- `numerical_variant` — same stem with different figures

Topic signals keep their own canonical rows (`review_state=topic_signal`,
`question_type=topic`) and must not be rewritten into fake exact questions.

## Identity and hashing

- Surrogate ids: `{prefix}_{uuid16}` via `new_id`
- Dedup key: `normalised_hash` on cleaned lowercase wording
- Occurrences reference `question_variant_id` so merges preserve interview links
