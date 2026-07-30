# Extraction → Canonicalisation

Extraction adapters emit `ExtractedRecord` rows. Canonicalisation consumes the
question-like subset and produces the deduplicated corpus layer.

## Input: ExtractedRecord

Required fields:

- `source_artefact_id` — parent `RawArtefact`
- `exact_source_text` — grounded span (no invented text)
- `record_type` — `ExtractionClass`
- `extraction_method` — parser / importer id
- `extracted_metadata` — optional employer, role, topic, domain, pe_relevance, …

Only these classes enter the question graph:

| ExtractionClass | Variant type | Canonical treatment |
|-----------------|--------------|---------------------|
| `exact_question` | `exact` | Canonical wording = cleaned source text |
| `paraphrased_question` | `paraphrase` | May join an exact cluster; does not invent text |
| `topic_signal` | `topic_signal` | Separate lane; wording stays the topic phrase |

Other classes (answers, comments, format notes, …) are ignored by
`canonical.canonicalise`.

## Pipeline

```
ExtractedRecord[]
    → split_multi_questions (numbered / ?-follow-on)
    → normalise + hash
    → exact / fuzzy cluster (answer-compatibility gated)
    → CanonicalQuestion + QuestionVariant + InterviewOccurrence
    → merge_audit[]
    → optional families.build_relationship_graph
```

## Metadata → occurrence

When metadata includes interview context (`employer`, `role`,
`interview_review_id`, `office`, `round`, `interview_date`, `detail_url`, …),
canonicalisation creates an `InterviewOccurrence` linked to the new variant.

## Multi-question spans

If source text clearly lists multiple questions, each segment becomes its own
record path while metadata retains:

- `parent_span` — original unsplit text
- `split_index` / `split_count`

## Downstream

- Answers attach to `canonical_question_id` (never to a raw span alone)
- PE classifiers may set `domain` / `pe_relevance` on metadata before
  canonicalisation; values are copied onto `CanonicalQuestion`
- Orchestration persists rows via `storage.db` / `migrations/001_init.sql`

See also: [deduplication.md](deduplication.md), [data-model.md](data-model.md).
