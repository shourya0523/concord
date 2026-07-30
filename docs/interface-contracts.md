# Interface Contracts

Frozen shared interfaces for all workstreams. Implementation lives in
`src/ibpe_corpus/schemas/models.py`.

## Source adapter interface

Every source adapter implements:

```python
class SourceAdapter(Protocol):
    name: str
    def discover(self, config: dict) -> list[dict]: ...
    def fetch(self, target: dict) -> SourceAdapterResult: ...
    def parse_artefact(self, artefact: RawArtefact) -> SourceAdapterResult: ...
```

`SourceAdapterResult` contains: `artefacts`, `extracted`, `responses`,
`access_state`, `diagnostics`, `metrics`.

## Raw artefact schema

`RawArtefact`: id, source_family, url_or_path, commit_sha, retrieved_at,
raw_html_path, raw_json_path, screenshot_path, network_log_path, content_hash,
parser_version, access_state, session_class, metadata.

## Extracted-record schema

`ExtractedRecord`: id, source_artefact_id, exact_source_text,
source_selector_or_span, record_type (`ExtractionClass`), extraction_method,
extracted_metadata, grounding_confidence, validation_status.

## Canonical-question schema

`CanonicalQuestion`: id, canonical_wording, question_type, topic, subtopic,
domain (`ib|pe|both|other`), pe_strategy, pe_relevance, seniority, difficulty,
review_state, normalised_hash.

`QuestionVariant` links source wording to a canonical id with normalised_hash.

## Answer schema

`Answer`: id, canonical_question_id, concise_answer, expanded_explanation,
assumptions, calculation_representation, common_mistakes, follow_ups,
provenance_type (`source_provided|corpus_matched|synthesised_*|needs_review|rejected`),
source_ids, generator_version, validator_version, validation_status, confidence.

**Rule:** never store synthesised text as `source_provided`.

## Interview-occurrence schema

`InterviewOccurrence`: id, question_variant_id, interview_review_id, employer,
employer_id, role, office, round, interview_date, recruiting_cycle, outcome,
source_id, confidence, detail_url.

## Question-response schema

`QuestionResponse`: Glassdoor comments/answers as child resources with
`ResponseType` classification. Not every comment is an authoritative answer.

## Job-result schema

`JobResult`: job_name, idempotency_key, state, started/completed, retry_count,
error_classification, input/output counts, parser/model version,
resume_checkpoint, metrics.

## Error / dead-letter schema

`DeadLetter`: id, job_name, idempotency_key, error_classification, error_message,
payload, created_at, retryable.

## Metrics names

Stable metric keys used across jobs:

- `pages_discovered`, `pages_fetched`, `pages_blocked`, `pages_unchanged`
- `search_pages_exhausted`, `question_details_reached`, `responses_reached`
- `exact_questions`, `topic_signals`, `core_pe_records`, `pe_false_positives`
- `source_answers`, `matched_answers`, `generated_answers`, `validated_answers`
- `rejected_answers`, `canonical_questions`, `duplicate_rate`
- `parser_failure_rate`, `zero_result_anomalies`

## Fixture format

Sidecar `*.meta.json` beside each fixture:

```json
{
  "fixture_id": "synthetic-question-detail-qtn",
  "surface": "question_detail",
  "fixture_origin": "synthetic",
  "url": "https://www.glassdoor.com/Interview/...QTN_....htm",
  "access_state": "public",
  "notes": "..."
}
```

HTML fixtures under `fixtures/glassdoor/html/`, JSON under `fixtures/glassdoor/json/`.
