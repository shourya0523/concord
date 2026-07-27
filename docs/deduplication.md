# Deduplication

Canonicalisation lives in `src/ibpe_corpus/canonical/`. It turns
`ExtractedRecord` rows into `CanonicalQuestion` + `QuestionVariant` graphs with
reversible merge audits.

## Normalisation

`normalise.normalised_hash(text)`:

1. Collapse whitespace
2. Lowercase
3. Lightly strip punctuation (keeps `%` and `$`)
4. SHA-256 hex of the normalised string

Exact duplicates (punctuation/case/spacing only) share one hash and merge.

## Merge policy

| Step | Rule |
|------|------|
| Exact | Same `normalised_hash` → join survivor cluster |
| Fuzzy | `rapidfuzz.token_set_ratio` ≥ threshold (default **92**) on normalised text |
| Answer gate | Merge only when `same_answer_would_satisfy` — distinctive concepts (DCF vs LBO, WACC, EV, …) must agree |
| Topic lane | `topic_signal` never merges with exact/paraphrase; never upgraded to fabricated exact wording |

## Merge audit (reversible)

Each join records:

```json
{
  "id": "mrg_…",
  "survivor_id": "cq_…",
  "merged_id": "cq_…",
  "reason": "exact_hash|fuzzy_match",
  "reversible": true,
  "payload": {
    "merged_question": { "...": "CanonicalQuestion snapshot" },
    "survivor_question": { "...": "..." },
    "reassigned_variant_ids": ["qv_…"],
    "fuzzy_score": 96.0
  }
}
```

`reverse_merge(result, audit)` restores the absorbed question and re-points
variants listed in `reassigned_variant_ids`.

## Occurrences

`InterviewOccurrence` rows hang off **variants**, not canonicals. Merging
canonicals reassigns `QuestionVariant.canonical_question_id` only — occurrence
links stay valid.

## Multi-question split

Clear multi-question blobs are split before clustering:

- Numbered lists: `1.` / `2)` / `(3)`
- `?` followed by another capitalised question

Each segment keeps `parent_span` (and split index) in metadata.

## Relationships

`families.build_relationship_graph` emits:

- `prerequisite` / `follow_up` — IB/PE topic ladders (e.g. WACC → DCF)
- `related` — embedding neighbourhood
- `duplicate_candidate` — high fuzzy score left unmerged

## Embeddings

`embeddings.hashing_embed` is a bag-of-words hashing trick (no ML deps) with
cosine similarity for neighbour retrieval.
