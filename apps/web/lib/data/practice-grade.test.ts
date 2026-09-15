import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { gradeDeterministic } from "../practice-grade-core"

describe("gradeDeterministic", () => {
  it("scores high when response covers teaching gold cues", () => {
    const grade = gradeDeterministic({
      responseText:
        "WACC is the weighted average cost of capital blending cost of equity and after-tax cost of debt by capital structure weights.",
      goldConcise:
        "WACC blends cost of equity and after-tax cost of debt using target capital structure weights.",
      goldExpanded: "Discount unlevered free cash flows at WACC to enterprise value.",
      answerId: "ans_wacc_1",
      topic: "wacc",
      heatTopics: [
        {
          firm_id: "firm_goldman-sachs",
          topic_id: "valuation",
          intensity: 0.8,
          sample_size: 40,
        },
      ],
    })
    assert.equal(grade.score_source, "deterministic")
    assert.ok(grade.score >= 0.4, `expected score>=0.4 got ${grade.score}`)
    assert.ok(grade.citations.some((c) => c.kind === "teaching_answer"))
    assert.ok(grade.citations.some((c) => c.kind === "heat_topic"))
    assert.match(grade.feedback, /Firm heat|Coverage/)
  })

  it("scores low on empty / unrelated response", () => {
    const grade = gradeDeterministic({
      responseText: "I like pizza and beaches.",
      goldConcise: "Enterprise value equals equity value plus net debt.",
      answerId: "ans_ev_1",
      topic: "valuation",
    })
    assert.ok(grade.score < 0.4, `expected low score got ${grade.score}`)
    assert.equal(grade.correct, false)
    assert.deepEqual(grade.weak_topics, ["valuation"])
  })
})
