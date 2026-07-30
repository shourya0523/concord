# Bank field → layer map

Glassdoor `question_bank.json` is **firm-signal fuel** (prompt §16). Process text is never a teaching answer.

| Bank field | Raw | Staging | Normalised | Canonical / published |
|------------|-----|---------|------------|------------------------|
| `id` (SHA1) | — | `staging_records.legacy_bank_id` | — | `question_occurrences.id` + `legacy_bank_id`; `question_variants.legacy_bank_id` |
| `company` | artefact metadata | `firm_raw` | → `firms` / aliases | `question_occurrences.firm_id`, `employer_raw` |
| `track` | — | `track_raw` | `track` | `question_occurrences.track` |
| `position` | — | `role_raw` | → `roles` / aliases | `question_occurrences.role_id`, `role_raw` |
| `date_posted` | — | `reported_date_raw` | `reported_date` | `question_occurrences.interview_date` |
| `user` | — | `bank_payload_json.user` | originals | — (staging only) |
| `experience` | — | `bank_payload_json.experience` | originals | — |
| `question` | — | `extracted_question`, `exact_source_text` | `wording_normalised` / hash | `question_variants.source_wording` |
| `process` | — | `process_text` only | — | `question_occurrences.process_text` (**signal**, not answer) |
| `scraped_at` | `source_artifacts.retrieved_at` | `scraped_at` | — | `question_occurrences.scraped_at` |

Bootstrap seed path:

```text
question_bank.json
  → raw.sources (glassdoor_question_bank)
  → raw.source_runs (bank_seed)
  → raw.source_artifacts (file hash)
  → staging.staging_records (ON CONFLICT legacy_bank_id)
  → canonical.firms / roles (slug upsert)
  → canonical.question_variants (ON CONFLICT legacy_bank_id)
  → canonical.question_occurrences (ON CONFLICT legacy_bank_id)
  → published.v_firm_topic_heat / v_company_room_signals
```

GitHub teaching Q/A (owned by data-quality) fills `canonical_questions` + `answers` with `publishable=true`; Glassdoor seed does **not** create published answers.
