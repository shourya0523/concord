# Answer validation

Validators in `src/ibpe_corpus/answers/validate.py` quality-check answers before
export, with emphasis on synthesised content.

## Validators

| Validator | Role |
|-----------|------|
| `technical_finance_validator` | Keyword/structure checks that topic formulas and cues are present |
| `numerical_validator` | Executable checks for WACC, MOIC, IRR approx, EV bridge, simple LBO exit equity |
| `assumption_validator` | Flags dependencies (tax rate, leases, SBC, NCI, terminal growth, exit multiple) |
| `independent_validator` | Second pass without trusting draft reasoning — rejects empty/garbage and re-runs numerics |

`validator_version` is set from `ibpe_corpus.VALIDATOR_VERSION` (`answer-val-v1`).

## Status → provenance mapping (synthesised)

| ValidationStatus | AnswerProvenance |
|------------------|------------------|
| `pass`, `pass_with_assumptions` | `synthesised_validated` |
| `needs_correction` | `needs_review` |
| `reject` | `rejected` |

Source-provided and corpus-matched answers keep their provenance unless rejected
as empty/garbage (then `rejected`).

## Numerical checks

When `calculation_representation.topic` is set:

- **wacc** — `E/V×Re + D/V×Rd×(1−t)` vs `expected.wacc`
- **moic_irr** — MOIC and `MOIC^(1/n)−1` IRR approximation
- **ev_bridge** — net debt and `EV = equity + net debt (+ preferred + NCI)`
- **lbo** / **paper_lbo** — exit equity and MOIC from EBITDA × multiple − net debt

## Assumption flags

Detected cues append `depends_on:<flag>` to `assumptions` (e.g. `depends_on:tax_rate`
when tax rate appears in text or calc inputs).

## Critical rule

Synthesised answers must **never** be stored as `source_provided`. If a generator
version is present on a `source_provided` record, validation downgrades to
`needs_review`.

## Pipeline

`fill_answers` runs `validate_answer` as the final layer for every newly filled answer.
