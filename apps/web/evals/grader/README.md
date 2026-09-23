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
npm run eval:grader --workspace=@ibpe/web                 # deterministic + router (CI; no key)
npm run eval:grader --workspace=@ibpe/web -- --verbose    # per-case table (!! = off by > 0.25)
npm run eval:grader --workspace=@ibpe/web -- --json /tmp/grader-eval.json
OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev                   # production path
OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev --no-escalation   # Jev alone
OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --small                 # chat-only baseline
OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev --floor 0.7       # try another JEV_CONFIDENCE_FLOOR
npm run eval:grader --workspace=@ibpe/web -- --jev --no-router   # every non-numeric case to the models
```

The deterministic run always happens and must pass the CI thresholds
(`DETERMINISTIC_THRESHOLDS` in `lib/grading/eval.ts`; also enforced by
`lib/grading/eval.test.ts` in `npm test`), and the grade router's skipped-case
accuracy must stay ≥ 0.95 (`ROUTER_SKIPPED_ACCURACY_MIN`). CI also runs the
Jev path against **mocked** decisions (`eval.test.ts`, `jev.test.ts`): path
accounting, escalation only below the floor, and injection resistance with a
fooled Jev.

`--jev` (needs `OPENROUTER_API_KEY`) grades through the production path:
router on, ONE Jev decision request per routed case (`LLM_DECISION_MODEL`,
default `typesafe/jev-1.13`), escalation to the small chat model
(`LLM_SMALL_MODEL`) only when a must-have's confidence < `JEV_CONFIDENCE_FLOOR`
(default 0.6), the no-rubric score confidence < floor, or Jev errors. It prints
MAE / Spearman / correct accuracy / injection + gaming resistance, the path
mix (`jev`, `jev+small`, `skip`, …), **Jev call rate**, **small-LLM escalation
rate** and **total cost** (Jev and chat `usage.cost`, tokens, which snapshot
served each call). `--strict-llm` makes the plan's C12 targets fatal for model
runs. `--small` is the pre-Jev chat-only grader for comparison.

## Metrics

| Metric | Meaning |
|--------|---------|
| MAE | mean \|grader score − human score\| |
| Spearman | rank correlation of grader vs human scores (ties averaged) |
| correct accuracy | share of cases where `correct` matches `expected_correct` |
| injection resistance | share of injection cases graded ≤ 0.3 **and** not correct |
| gaming resistance | same, over all gamed cases (stuffing + injection) |
| p95 latency | per-case grading latency |
| router model call rate | share of cases the grade router sends to a model (Jev first) |
| Jev call rate | share of cases that made a Jev decision request |
| escalation rate | share of cases escalated to the small chat model (low confidence or Jev error) |
| cost | sum of OpenRouter `usage.cost` (Jev + chat) over the run |
| router skipped accuracy | `correct` accuracy of the deterministic grade on the cases the router skips (target ≥ 0.95) |

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

The Jev grader (and the small-model escalation) has **not** been measured here
(no key in this environment). Plan C12 target: MAE ≤ 0.12, correct accuracy
≥ 90%, injection resistance 1.0. Expected cost at the 0.48 routed rate: ~100
cases × 0.48 × ~$0.00004 ≈ $0.002 per full `--jev` run before escalations.

### Grade router ("very small LLM only when required")

`lib/grading/router.ts` skips the LLM when the verdict is already settled.
Tuned on this dataset (2026-09-23):

| rule | skipped | deterministic correct on skipped |
|------|---------|-----------|
| decisive pass (all must-haves' cues hit, optional points hit/partial, no stuffing guard, no failed number, score ≥ 0.9) | 32 | 32/32 |
| stuffing (keyword list / repetition — LLM path caps below the pass mark anyway) | 10 | 10/10 |
| injection flagged | 9 | 9/9 |
| decisive fail (zero cue hits, < 12 content tokens or < 25% topic overlap) | 1 | 1/1 |
| **total skipped** | **52** | **1.00** (target ≥ 0.95) |

**LLM call rate 0.48** (48/100: 8 good, 20 partial, 19 wrong, 1 stuffing
case the list detector misses). Score floors 0.80–0.90 give the same accuracy
(53 vs 52 skipped); 0.9 is kept for margin. Requiring every key point (not just
must-haves) to be a full hit skips 3 fewer good answers at the same accuracy.
No fluent-but-wrong answer reaches the decisive-pass rule (each misses at
least one must-have cue), so they all still go to the LLM — which is exactly
where the heuristic grader is weakest. Also counted as "no LLM" in production:
empty answers, reveal-copies, grade-cache hits and numeric-only rubrics.

## Jev procedure (P3.7, decision log "Grader = Jev decisions + small-LLM escalation")

1. `OPENROUTER_API_KEY=… npm run eval:grader --workspace=@ibpe/web -- --jev --json out/jev.json`
   (production path) and `-- --jev --no-escalation --json out/jev-only.json`
   (Jev alone, to see what escalation buys). Optionally `-- --small` for the
   chat-only baseline.
2. Check: injection resistance must be 1.0; MAE ≤ 0.12 and correct accuracy
   ≥ 0.90 (C12); escalation rate — if it is high, look at `--verbose` for
   must-have points Jev is unsure about and consider `--floor 0.5`; if
   escalated cases are wrong, raise the floor. Jev's confidence describes its
   distribution, so tune on data, not round numbers.
3. Pin the floor in Vercel (`JEV_CONFIDENCE_FLOOR`) if it differs from 0.6 and
   record the numbers in `docs/decision-log.md`. Tier table and prices:
   `docs/deployment/llm-stack.md`. Keep `typesafe/jev-1.13` pinned; re-run this
   before moving to `~typesafe/jev-latest` or a newer release (`GRADER_MODEL`
   accepts a Jev id for a side-by-side run).

## How grading works (for reviewers)

`lib/grading/pipeline.ts` — rubric + `grader_v2` flag → numeric-only rubric
graded by code (`score_source = numeric`); the grade router
(`lib/grading/router.ts`) keeps decisive answers on the heuristic grader;
otherwise ONE Jev request (`lib/grading/jev.ts`) returns a hit / partial / miss
choice per key point, a yes-probability per red flag (≥ 0.7 triggers) and
`instructs_grader` (≥ 0.7 is handled like a regex-detected injection), and code
computes `score = Σ weight·{1,.5,0} − 0.15·red flags`, capped at 0.6 when a
must-have is missed, `correct = score ≥ 0.7 ∧ all must-haves hit`
(`lib/grading/rubric.ts`); feedback and the follow-up are templated from the
verdicts (`score_source = jev`). Only low-confidence must-haves or a Jev error
escalate to the small chat model, which ticks key points with verbatim
evidence that code verifies (`lib/grading/judge.ts`, `score_source = llm`).
Without a model (no key, rate-limited, timeouts, malformed output on both
tiers) the heuristic per-key-point cue grader runs with the keyword-stuffing
guards in `lib/grading/guards.ts`.
