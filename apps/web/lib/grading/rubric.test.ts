import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { AnswerRubric } from "@ibpe/contracts"
import {
  applyVerdicts,
  chooseFollowUp,
  cueMatches,
  judgeKeyPointDeterministic,
  MUST_HAVE_CAP,
  parseRubric,
  rubricFingerprint,
  scoreNumericOnly,
  scoreRubric,
  verifyEvidence,
} from "./rubric"

export const EV_RUBRIC: AnswerRubric = {
  version: "rubric-v1",
  kind: "technical",
  key_points: [
    {
      id: "k1",
      text: "Equity value is the value to common shareholders",
      weight: 0.4,
      must_have: true,
      cues: ["shareholders", "share price|market cap"],
    },
    {
      id: "k2",
      text: "Enterprise value is the value of operations to all capital providers",
      weight: 0.4,
      must_have: true,
      cues: ["operations|operating", "all capital providers|debt and equity"],
    },
    {
      id: "k3",
      text: "Bridge: add net debt, subtract cash",
      weight: 0.2,
      must_have: false,
      cues: ["net debt", "cash"],
    },
  ],
  red_flags: ["Says EV = equity value + cash"],
  common_mistakes: [],
  follow_ups: ["Why do we subtract cash when moving to enterprise value?", "Can enterprise value be negative?"],
  numeric_checks: [],
  provenance: "human",
  review_status: "approved",
}

describe("parseRubric", () => {
  it("parses objects and JSON strings, rejects invalid rubrics", () => {
    assert.equal(parseRubric(EV_RUBRIC)?.key_points.length, 3)
    assert.equal(parseRubric(JSON.stringify(EV_RUBRIC))?.version, "rubric-v1")
    assert.equal(parseRubric({ key_points: [] }), null)
    assert.equal(parseRubric("not json"), null)
    assert.equal(parseRubric(null), null)
  })

  it("fills contract defaults", () => {
    const parsed = parseRubric({
      key_points: [{ id: "a", text: "x", weight: 1 }],
      provenance: "llm",
    })
    assert.equal(parsed?.key_points[0]?.must_have, false)
    assert.deepEqual(parsed?.numeric_checks, [])
    assert.equal(parsed?.review_status, "pending")
  })
})

describe("rubricFingerprint", () => {
  it("is stable for equal content and changes when grading content changes", () => {
    const a = rubricFingerprint(EV_RUBRIC)
    const b = rubricFingerprint(JSON.parse(JSON.stringify(EV_RUBRIC)) as AnswerRubric)
    assert.equal(a, b)
    const edited = { ...EV_RUBRIC, red_flags: ["different"] }
    assert.notEqual(rubricFingerprint(edited), a)
    // review metadata does not affect grading
    assert.equal(rubricFingerprint({ ...EV_RUBRIC, review_status: "pending" }), a)
    assert.equal(rubricFingerprint(null), "none")
  })
})

describe("verifyEvidence", () => {
  const answer = "Equity value is what   SHAREHOLDERS own — share price × diluted shares, i.e. “market cap”."

  it("accepts whitespace/case/unicode-normalised substrings", () => {
    assert.equal(verifyEvidence(answer, "equity value is what shareholders own"), true)
    assert.equal(verifyEvidence(answer, '"market cap"'), true)
    assert.equal(verifyEvidence(answer, "share price x diluted shares"), true)
  })

  it("accepts punctuation-insensitive quotes and ellipsis-joined fragments", () => {
    assert.equal(verifyEvidence(answer, "shareholders own share price"), true)
    assert.equal(verifyEvidence(answer, "Equity value ... diluted shares"), true)
  })

  it("rejects fabricated, empty or trivial quotes", () => {
    assert.equal(verifyEvidence(answer, "enterprise value includes debt"), false)
    assert.equal(verifyEvidence(answer, ""), false)
    assert.equal(verifyEvidence(answer, null), false)
    assert.equal(verifyEvidence(answer, "is"), false)
    assert.equal(verifyEvidence(answer, "Equity value ... net debt"), false)
  })
})

describe("applyVerdicts", () => {
  it("downgrades hits without verifiable evidence and fills missing ids as misses", () => {
    const answer = "Equity value is the value to shareholders, the market cap."
    const { items, downgraded } = applyVerdicts(
      EV_RUBRIC.key_points,
      [
        { id: "k1", verdict: "hit", evidence: "value to shareholders" },
        { id: "k2", verdict: "hit", evidence: "EV is value to all capital providers" },
      ],
      answer,
    )
    assert.deepEqual(
      items.map((i) => i.verdict),
      ["hit", "miss", "miss"],
    )
    assert.deepEqual(downgraded, ["k2"])
    assert.equal(items[1]?.evidence, null)
  })
})

describe("scoreRubric", () => {
  it("computes the weighted score and correct when all must-haves hit", () => {
    const s = scoreRubric({
      items: [
        { weight: 0.4, must_have: true, verdict: "hit" },
        { weight: 0.4, must_have: true, verdict: "hit" },
        { weight: 0.2, must_have: false, verdict: "partial" },
      ],
    })
    assert.equal(s.score, 0.9)
    assert.equal(s.correct, true)
  })

  it("caps at 0.6 and marks incorrect when a must-have is not hit", () => {
    const s = scoreRubric({
      items: [
        { weight: 0.2, must_have: true, verdict: "partial" },
        { weight: 0.8, must_have: false, verdict: "hit" },
      ],
    })
    assert.equal(s.raw, 0.9)
    assert.equal(s.score, MUST_HAVE_CAP)
    assert.equal(s.correct, false)
  })

  it("subtracts 0.15 per red flag and clamps at 0", () => {
    const hit = [{ weight: 1, must_have: true, verdict: "hit" as const }]
    assert.equal(scoreRubric({ items: hit, redFlagCount: 1 }).score, 0.85)
    assert.equal(scoreRubric({ items: hit, redFlagCount: 2 }).score, 0.7)
    assert.equal(scoreRubric({ items: hit, redFlagCount: 2 }).correct, true)
    assert.equal(scoreRubric({ items: hit, redFlagCount: 3 }).correct, false)
    const miss = [{ weight: 1, must_have: false, verdict: "miss" as const }]
    assert.equal(scoreRubric({ items: miss, redFlagCount: 3 }).score, 0)
  })

  it("never reports correct with score < 0.7 (score and correct always agree)", () => {
    for (const verdicts of [
      ["hit", "partial", "partial"],
      ["hit", "hit", "miss"],
      ["partial", "partial", "partial"],
    ] as const) {
      const s = scoreRubric({
        items: verdicts.map((verdict) => ({ weight: 1 / 3, must_have: false, verdict })),
      })
      assert.equal(s.correct, s.score >= 0.7)
    }
  })

  it("weights each numeric check like an average key point", () => {
    const s = scoreRubric({
      items: [
        { weight: 0.5, must_have: true, verdict: "hit" },
        { weight: 0.5, must_have: false, verdict: "hit" },
      ],
      numeric: [{ pass: false }, { pass: true }],
    })
    // credit = 0.5 + 0.5 + 0.5 = 1.5 of 2.0
    assert.equal(s.score, 0.75)
  })

  it("scores numeric-only rubrics by fraction passed", () => {
    const pass = { id: "n", label: "x", expected: 1, found: 1, pass: true }
    const fail = { ...pass, pass: false }
    assert.equal(scoreNumericOnly([pass, pass]).correct, true)
    assert.equal(scoreNumericOnly([pass, fail]).score, 0.5)
    assert.equal(scoreNumericOnly([pass, fail]).correct, false)
  })
})

describe("chooseFollowUp", () => {
  const items = [
    { id: "k1", verdict: "hit" as const, weight: 0.4, must_have: true },
    { id: "k2", verdict: "hit" as const, weight: 0.4, must_have: true },
    { id: "k3", verdict: "miss" as const, weight: 0.2, must_have: false },
  ]

  it("uses a valid model follow_up_id", () => {
    assert.equal(chooseFollowUp(EV_RUBRIC, items, "f2"), "Can enterprise value be negative?")
  })

  it("falls back to the follow-up targeting the heaviest missed point", () => {
    assert.equal(
      chooseFollowUp(EV_RUBRIC, items, "f9"),
      "Why do we subtract cash when moving to enterprise value?",
    )
  })

  it("returns null when every key point was hit and the model chose none", () => {
    const allHit = items.map((i) => ({ ...i, verdict: "hit" as const }))
    assert.equal(chooseFollowUp(EV_RUBRIC, allHit, null), null)
  })
})

describe("deterministic key point judge", () => {
  it("supports cue alternatives and stems", () => {
    const tokens = new Set(["consolidat", "minority", "interest"])
    assert.equal(cueMatches("non-controlling|minority interest", tokens, ""), true)
    assert.equal(cueMatches("NCI", tokens, ""), false)
  })

  it("grades per key point from cues", () => {
    const answer = "Equity value is the market cap owned by shareholders."
    const kp1 = judgeKeyPointDeterministic(EV_RUBRIC.key_points[0]!, answer)
    const kp2 = judgeKeyPointDeterministic(EV_RUBRIC.key_points[1]!, answer)
    assert.equal(kp1.verdict, "hit")
    assert.ok(kp1.evidence && answer.includes(kp1.evidence))
    assert.equal(kp2.verdict, "miss")
  })

  it("falls back to key point text tokens when no cues", () => {
    const kp = { id: "x", text: "Free cash flow pays down debt", cues: [] }
    assert.equal(judgeKeyPointDeterministic(kp, "Cash flow is used to pay down debt").verdict, "hit")
    assert.equal(judgeKeyPointDeterministic(kp, "They borrow more").verdict, "miss")
  })
})
