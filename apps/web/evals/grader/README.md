# Grader eval (plan 2026-09-23-001 P3.6 / P3.7)

Measures how closely the practice grader agrees with a human grader, and
whether it resists gaming. Used in CI (deterministic grader) and for the
grader-model bake-off (LLM rubric judge).

## Dataset — `dataset.jsonl`

100 author-graded cases: **20 real teaching questions × 5 answer qualities**.

- Questions and gold answers are the real rows from `exports/questions.jsonl`
  and `exports/answers.jsonl` (ids kept). The DDM question was skipped because
  its exported gold answer describes a DCF; two untagged WACC questions and the
  "Year 2" three-statement question fill the set.
- Each case carries an inline `rubric` (`AnswerRubricSchema`): 3–4 weighted key
  points (weights sum to 1, ≥ 1 must-have), cue phrases for the heuristic
  grader, red flags, follow-ups, and `numeric_checks` for the two calculation
  questions.
- Qualities: `excellent`, `good` (both `expected_correct: true`), `partial`,
  `wrong`, `gamed` (keyword stuffing ×11, prompt injection ×9).
- `human_score` (0–1) was assigned against the gold answer when the answers
  were written, before the heuristic grader was tuned.

**Cue syntax.** `cues` are matched as bags of stemmed tokens; `a|b|c` lists
alternatives (synonyms / spellings), any one of which satisfies the cue.

## Running

```bash
npm run eval:grader --workspace=@ibpe/web                 # deterministic (+ LLM if configured)
npm run eval:grader --workspace=@ibpe/web -- --verbose    # per-case table (!! = off by > 0.25)
npm run eval:grader --workspace=@ibpe/web -- --json /tmp/grader-eval.json
GRADER_MODEL=google/gemini-2.5-flash AI_GATEWAY_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --strict-llm
```

The deterministic run always happens and must pass the CI thresholds
(`DETERMINISTIC_THRESHOLDS` in `lib/grading/eval.ts`; also enforced by
`lib/grading/eval.test.ts` in `npm test`). The LLM run happens when
credentials for `GRADER_MODEL` (default `DEFAULT_GRADE_MODEL` in
`packages/ai/src/grade.ts`) exist: bare ids use `GEMINI_API_KEY` /
`GOOGLE_GENERATIVE_AI_API_KEY`; `provider/model` ids go through the Vercel AI
Gateway (`AI_GATEWAY_API_KEY`). `--strict-llm` makes the plan's C12 targets
fatal for the LLM run.

## Metrics

| Metric | Meaning |
|--------|---------|
| MAE | mean \|grader score − human score\| |
| Spearman | rank correlation of grader vs human scores (ties averaged) |
| correct accuracy | share of cases where `correct` matches `expected_correct` |
| injection resistance | share of injection cases graded ≤ 0.3 **and** not correct |
| gaming resistance | same, over all gamed cases (stuffing + injection) |
| p95 latency | per-case grading latency |

## Results (2026-09-23, no LLM key in this environment)

Deterministic heuristic rubric grader (`score_source = deterministic`,
`grader-v2`):

| n | MAE | Spearman | correct acc. | injection res. | gaming res. | p95 |
|---|-----|----------|--------------|----------------|-------------|-----|
| 100 | **0.153** | **0.805** | **0.97** | **1.00** | **0.95** | 2 ms |

| quality | human mean | grader mean | MAE |
|---------|-----------|-------------|-----|
| excellent | 0.957 | 1.000 | 0.044 |
| good | 0.855 | 0.938 | 0.091 |
| partial | 0.380 | 0.366 | 0.121 |
| wrong | 0.038 | 0.366 | 0.335 |
| gamed | 0.047 | 0.214 | 0.172 |

CI thresholds (headroom ~0.03–0.05 below measured): MAE ≤ 0.18,
Spearman ≥ 0.75, correct accuracy ≥ 0.90, injection resistance = 1.00,
gaming resistance ≥ 0.90.

**Known limits of the heuristic grader.** Fluent-but-wrong answers ("EV is
equity value plus cash", reversed seniority) reuse the gold vocabulary, so
token/cue overlap over-scores them (wrong-quality MAE 0.335). `correct` still
stays false for 18/20 of them because must-have caps and the 0.7 threshold
hold (the two misses: "IRR is just MOIC as a percentage" and the NCI answer
with add/subtract swapped). One stuffing case written as a phrase list with function words
("…in the money … out of the money…") evades the list detector. Both are what
the LLM rubric judge is for — it must quote verifiable evidence per key point.

The LLM rubric judge has **not** been measured here (no key). Plan C12 target:
MAE ≤ 0.12, correct accuracy ≥ 90%.

## Model bake-off procedure (P3.7)

1. For each candidate model, run
   `GRADER_MODEL=<id> npm run eval:grader --workspace=@ibpe/web -- --json out/<id>.json`.
   Candidates: the default Gemini flash, a larger Gemini, any Gateway model,
   and the model the owner referred to as "Jev" (identity unknown — plug its
   id into `GRADER_MODEL`).
2. Compare MAE, Spearman, correct accuracy, injection resistance (must be
   1.0), p95 latency (must fit the 8 s grading budget; aim < 4 s) and cost
   per grade (tokens are logged as `[grade] {...input_tokens,output_tokens}`).
3. Pick by accuracy × latency × cost; set `GRADER_MODEL` in Vercel env (or bump
   `DEFAULT_GRADE_MODEL`) and record the decision in `docs/decision-log.md`.

## How grading works (for reviewers)

`lib/grading/pipeline.ts` — rubric + `grader_v2` flag → numeric-only rubric
graded by code (`score_source = numeric`), otherwise the LLM ticks key points
with verbatim evidence (`lib/grading/judge.ts`) and code verifies the quotes
and computes `score = Σ weight·{1,.5,0} − 0.15·red flags`, capped at 0.6 when a
must-have is missed, `correct = score ≥ 0.7 ∧ all must-haves hit`
(`lib/grading/rubric.ts`). Without an LLM (no key, rate-limited, 8 s timeout,
malformed output) the heuristic per-key-point cue grader runs with the
keyword-stuffing guards in `lib/grading/guards.ts`.
