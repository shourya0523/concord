import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STAGE_CONCEPT,
  selectStageQuestions,
  stageForTopic,
  stageTopicRank,
} from "./select"

const IB = [{ id: "ib_fit" }, { id: "ib_accounting" }, { id: "ib_valuation" }, { id: "ib_deal_judgement" }]

describe("selectStageQuestions", () => {
  it("picks each stage's question by topic, not by pack index", () => {
    const picks = selectStageQuestions(IB, [
      { id: "q_dcf", topic: "valuation" },
      { id: "q_ma", topic: "merger_models" },
      { id: "q_acc", topic: "accounting" },
      { id: "q_fit", topic: "behavioral" },
    ])
    assert.deepEqual(
      picks.map((p) => [p.stageId, p.questionId, p.matchedBy]),
      [
        ["ib_fit", "q_fit", "topic"],
        ["ib_accounting", "q_acc", "topic"],
        ["ib_valuation", "q_dcf", "topic"],
        ["ib_deal_judgement", "q_ma", "topic"],
      ],
    )
  })

  it("prefers the most specific topic within a stage", () => {
    const picks = selectStageQuestions([{ id: "ib_valuation" }], [
      { id: "q_ev", topic: "enterprise_value" },
      { id: "q_dcf", topic: "valuation" },
    ])
    assert.equal(picks[0]!.questionId, "q_dcf")
  })

  it("falls back to the stage index when no topical match exists", () => {
    const picks = selectStageQuestions(IB, [
      { id: "q0", topic: null },
      { id: "q1", topic: "brainteasers" },
      { id: "q2", topic: "accounting" },
      { id: "q3" },
    ])
    assert.equal(picks[1]!.questionId, "q2")
    assert.equal(picks[1]!.matchedBy, "topic")
    // ib_fit has no match → index 0; valuation → index 2 is used → next unused (q3)
    assert.equal(picks[0]!.questionId, "q0")
    assert.equal(picks[0]!.matchedBy, "index")
    assert.equal(picks[2]!.questionId, "q3")
    assert.equal(picks[3]!.questionId, "q1")
  })

  it("never repeats a question and reports none when the pack runs out", () => {
    const picks = selectStageQuestions(IB, [
      { id: "q_acc", topic: "accounting" },
      { id: "q_acc", topic: "accounting" },
      { id: "q_other", topic: "credit" },
    ])
    const ids = picks.map((p) => p.questionId).filter(Boolean)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(ids.length, 2)
    assert.equal(picks.filter((p) => p.matchedBy === "none").length, 2)
  })

  it("normalises topic spelling", () => {
    assert.equal(stageTopicRank("pe_lbo", "LBO"), 0)
    assert.equal(stageTopicRank("pe_lbo", "paper-lbo"), 2)
    assert.equal(stageTopicRank("pe_lbo", null), -1)
  })

  it("every stage concept has topics and a concept slug", () => {
    for (const [id, concept] of Object.entries(STAGE_CONCEPT)) {
      assert.ok(concept.slug, id)
      assert.ok(concept.topics.length > 0, id)
    }
  })
})

describe("stageForTopic", () => {
  it("maps a topic to the best stage", () => {
    assert.equal(stageForTopic(IB.map((s) => s.id), "accounting"), "ib_accounting")
    assert.equal(stageForTopic(IB.map((s) => s.id), "lbo"), null)
  })
})
