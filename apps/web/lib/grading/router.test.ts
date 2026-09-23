import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { AnswerRubric, RubricItemResult } from "@ibpe/contracts"
import {
  DECISIVE_PASS_SCORE,
  routeGrade,
  topicOverlap,
  type RouterInput,
} from "./router"

const RUBRIC: AnswerRubric = {
  version: "rubric-v1",
  kind: "technical",
  key_points: [
    { id: "k1", text: "EV = equity value + net debt", weight: 0.5, must_have: true, cues: ["net debt"] },
    { id: "k2", text: "Add preferred stock and minority interest", weight: 0.3, must_have: true, cues: ["preferred"] },
    { id: "k3", text: "Subtract cash", weight: 0.2, must_have: false, cues: ["cash"] },
  ],
  red_flags: [],
  common_mistakes: [],
  follow_ups: [],
  numeric_checks: [],
  provenance: "human",
  review_status: "approved",
}

function items(verdicts: Array<RubricItemResult["verdict"]>): RubricItemResult[] {
  return RUBRIC.key_points.map((kp, i) => ({
    id: kp.id,
    text: kp.text,
    weight: kp.weight,
    must_have: kp.must_have,
    verdict: verdicts[i] ?? "miss",
    evidence: null,
  }))
}

function base(overrides: Partial<RouterInput> = {}): RouterInput {
  return {
    responseText: "Enterprise value is equity value plus net debt, preferred stock and minority interest, less cash.",
    rubric: RUBRIC,
    goldConcise: "EV equals equity value plus net debt plus preferred stock and minority interest, minus cash.",
    questionWording: "How do you get from equity value to enterprise value?",
    deterministic: {
      score: 1,
      rubric_items: items(["hit", "hit", "hit"]),
      numeric_checks: [],
      rubric_json: { stuffing_reasons: [], coverage: { k1: 1, k2: 1, k3: 1 } },
    },
    llmAvailable: true,
    model: "jev/jev-1",
    ...overrides,
  }
}

describe("routeGrade", () => {
  it("cheap guards skip the LLM first", () => {
    assert.equal(routeGrade(base({ responseText: "   " })).reason, "empty_answer")
    assert.equal(routeGrade(base({ revealCopy: true })).reason, "reveal_copy")
    assert.equal(routeGrade(base({ cacheHit: true })).reason, "cache_hit")
    assert.equal(routeGrade(base({ injection: true })).reason, "injection")
    const numeric = routeGrade(
      base({
        rubric: {
          ...RUBRIC,
          kind: "numeric",
          numeric_checks: [{ id: "n1", label: "x", expected: 1, tolerance: 0, tolerance_kind: "absolute" }],
        },
      }),
    )
    assert.deepEqual(numeric, { llm: false, reason: "numeric_only", model: null })
  })

  it("decisive pass: all must-haves hit, no guards, score ≥ floor", () => {
    assert.deepEqual(routeGrade(base()), { llm: false, reason: "decisive_pass", model: null })
    // Optional point partial is still decisive when the score clears the floor.
    const partial = base({
      deterministic: {
        score: 0.9,
        rubric_items: items(["hit", "hit", "partial"]),
        numeric_checks: [],
        rubric_json: { stuffing_reasons: [] },
      },
    })
    assert.equal(routeGrade(partial).reason, "decisive_pass")
  })

  it("not decisive when a must-have is partial, a number fails, stuffing fired or score is low", () => {
    const variants: Array<Partial<NonNullable<RouterInput["deterministic"]>>> = [
      { rubric_items: items(["partial", "hit", "hit"]) },
      { numeric_checks: [{ id: "n1", label: "x", expected: 1, found: 2, pass: false }] },
      { rubric_json: { stuffing_reasons: ["short_vs_gold"] } },
      { score: DECISIVE_PASS_SCORE - 0.01 },
    ]
    for (const v of variants) {
      const decision = routeGrade(base({ deterministic: { ...base().deterministic!, ...v } }))
      assert.deepEqual(decision, { llm: true, reason: "ambiguous", model: "jev/jev-1" }, JSON.stringify(v))
    }
  })

  it("hard shape guards skip the LLM (verdict cannot change)", () => {
    for (const reason of ["keyword_list", "repetition"]) {
      const decision = routeGrade(
        base({ deterministic: { ...base().deterministic!, score: 0.2, rubric_json: { stuffing_reasons: [reason] } } }),
      )
      assert.equal(decision.reason, "stuffing")
    }
  })

  it("decisive fail: zero cue hits and short or off-topic", () => {
    const zero = {
      score: 0,
      rubric_items: items(["miss", "miss", "miss"]),
      numeric_checks: [],
      rubric_json: { stuffing_reasons: [], coverage: { k1: 0, k2: 0, k3: 0 } },
    }
    assert.equal(routeGrade(base({ responseText: "No idea.", deterministic: zero })).reason, "decisive_fail")
    const offTopic =
      "I would talk about my leadership experience running the university chess club and organising charity tournaments for local schools every summer."
    assert.equal(routeGrade(base({ responseText: offTopic, deterministic: zero })).reason, "decisive_fail")
    // A long on-topic paraphrase with no cue hits still goes to the LLM.
    const paraphrase =
      "Start from equity value, then add the company's borrowings net of its liquid holdings, plus the claims of other capital providers ranking ahead of common equity, to arrive at enterprise value."
    assert.equal(routeGrade(base({ responseText: paraphrase, deterministic: zero })).llm, true)
    // Any partial cue hit → not decisive.
    const oneHit = { ...zero, rubric_items: items(["partial", "miss", "miss"]), rubric_json: { coverage: { k1: 0.5 } } }
    assert.equal(routeGrade(base({ responseText: "No idea.", deterministic: oneHit })).llm, true)
  })

  it("no rubric goes to the LLM; no caller → llm_unavailable", () => {
    assert.deepEqual(routeGrade(base({ rubric: null })), { llm: true, reason: "no_rubric", model: "jev/jev-1" })
    const ambiguous = base({ deterministic: { ...base().deterministic!, score: 0.5, rubric_items: items(["hit", "miss", "miss"]) } })
    assert.deepEqual(routeGrade({ ...ambiguous, llmAvailable: false }), {
      llm: false,
      reason: "llm_unavailable",
      model: null,
    })
  })

  it("topicOverlap", () => {
    assert.equal(topicOverlap("", "anything"), 0)
    assert.equal(topicOverlap("net debt", "equity value plus net debt"), 1)
    assert.ok(topicOverlap("chess club tournaments", "equity value plus net debt") < 0.1)
  })
})
