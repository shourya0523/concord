# Answer coverage report

_Generated 2026-09-23 from `exports/` by `ibpe_corpus.metrics.completeness` — do not hand-edit._

| Metric | Value |
|--------|------:|
| Publishable teaching questions | 666 |
| Questions with a publishable answer (C1) | 666 (100.0%) |
| Answers exported | 666 |
| Validated (pass / pass_with_assumptions) | 666 |
| Placeholder answers (`Structure a clear interview answer to:`) | 0 |
| Wordings still prefixed `Question N:` | 0 |
| `expanded == concise` | 99 (14.9%) |
| Tagged `needs_expansion` | 99 |
| With common mistakes or follow-ups | 284 |
| Approved rubric (C11) | 666 (100.0%) |

## Provenance

| Provenance | Answers |
|------------|--------:|
| `source_provided` | 573 |
| `synthesised_validated` | 93 |

## Rubrics

- Kinds: `star` 159, `technical` 507
- Provenance: `heuristic` 666
- Heuristic rubrics are extractive (key points are verbatim teaching-answer sentences)
  and auto-approved only when validators pass: weights sum to 1 ± 0.01, ≥ 1 must-have,
  ≤ 6 key points, numeric checks recompute via `calculators.py`. They are not
  human-reviewed; LLM `rubric-v1` rubrics replace them when a Gemini key is configured.

## Provenance rules

- Synthesised answers are never labelled `source_provided`.
- Glassdoor bank rows never supply teaching answers, key points or expected values.
- Generic placeholders are `needs_generation` and withheld by the publish gate.
