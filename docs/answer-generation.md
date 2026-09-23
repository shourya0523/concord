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

LLMs never write teaching answers directly. Downstream enrichment uses OpenRouter
(ADR 0007) **only when required**: rubric drafts (`rubric-v1`) when the extractive
rubric fails validation or is below the 0.8 auto-approve bar, and expansion
appendices (`expand-v1`) only for short source answers with no topic handler.
Both start on the small tier (`LLM_SMALL_MODEL`, default `deepseek/deepseek-v4-flash`)
and escalate to the primary tier (`LLM_PRIMARY_MODEL`, "Jev") only when the small
draft fails validation. Model output is always a pending proposal or a validated
rubric, with the served OpenRouter model id recorded in `model`.

## Pipeline integration

`fill_answers` invokes generation only after source ingest and corpus match fail.
Validation (`validate.py`) may promote provenance to `synthesised_validated`,
`needs_review`, or `rejected`.

## Topic handlers and placeholders (plan P1.3 / P2.4)

`generate.py` routes each question to one of: DCF, WACC, EV bridge, three statements, LBO, paper LBO,
MOIC/IRR, accretion/dilution, comps/precedents, valuation multiples, working capital, debt/credit,
PE fund mechanics, valuation overview, M&A process, restructuring, investment thesis, PE overview,
behavioural (STAR). Handlers carry worked examples whose numbers are recomputed by `calculators.py`;
`_FACETS` prepend question-specific lead sentences (e.g. negative working capital, incurrence vs
maintenance covenants). Provenance is always `synthesised_*`.

When nothing matches, `_generic_handler` emits the placeholder `Structure a clear interview answer to: …`
with `validation_status=needs_generation`; the validator keeps it unvalidated and the publish gate
withholds it. publish-teaching also retires any previously published placeholder.

Source answers: long single-block answers get an **extractive** concise lead (their own opening
sentences); playbook answers map model answer → concise, + deep dive → expanded, red flag →
`common_mistakes`, coaching → `coaching_notes`. Short answers stay as-is, tagged `needs_expansion`,
with a pending synthesised-appendix proposal (`answers/depth.py`) for an editor to approve.

Behavioural bank: `fixtures/corpus/behavioural_seed.json` (60 synthesised questions + guidance,
not Glassdoor) → `adapters/static/behavioural_seed.py`.
