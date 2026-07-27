# Answer generation

Deterministic template/heuristic generator in `src/ibpe_corpus/answers/generate.py`.

## Purpose

Produce structured `Answer` records for canonical IB/PE technical questions when no
source-provided or corpus-matched answer exists.

## Provenance rule

**Never** label synthesised output as `source_provided`. Fresh generator output is
always `synthesised_unvalidated` until validation runs.

## Routing

Topic detection uses keyword patterns over `canonical_wording`, `topic`, and
`subtopic`:

| Route | Triggers (examples) |
|-------|---------------------|
| `dcf` | DCF, discounted cash flow, terminal value |
| `three_statements` | 3-statements, linking statements |
| `lbo` / `paper_lbo` | LBO, leveraged buyout, paper LBO |
| `ev_bridge` | EV bridge, enterprise/equity value, net debt |
| `wacc` | WACC, weighted average cost of capital |
| `accretion_dilution` | accretion, dilution |
| `moic_irr` | MOIC, IRR |
| `generic` | fallback structured outline |

## Output fields

Each generated answer includes:

- `concise_answer` — interview-ready summary
- `expanded_explanation` — step-by-step walkthrough
- `assumptions` — explicit modelling dependencies
- `calculation_representation` — topic, formula, inputs, expected (where applicable)
- `common_mistakes`, `follow_ups`, `difficulty`, `references`

`generator_version` is set from `ibpe_corpus.GENERATOR_VERSION` (`answer-gen-v1`).

## Determinism

No LLM calls. Same `CanonicalQuestion` input yields the same answer content and
routing decision.

## Pipeline integration

`fill_answers` invokes generation only after source ingest and corpus match fail.
Validation (`validate.py`) may promote provenance to `synthesised_validated`,
`needs_review`, or `rejected`.
