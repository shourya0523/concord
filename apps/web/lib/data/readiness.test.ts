import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeFirmReadiness, rollUpConceptMastery, weeklyDelta } from "./readiness"

describe("computeFirmReadiness", () => {
  const heat = [
    { firm_id: "f", topic_id: "valuation", intensity: 0.9 },
    { firm_id: "f", topic_id: "accounting", intensity: 0.3 },
    { firm_id: "f", topic_id: "untagged", intensity: 1 },
    // No concept lab behind this topic yet → not measurable, excluded.
    { firm_id: "f", topic_id: "markets", intensity: 0.8 },
  ]

  it("weights concept mastery by heat intensity", () => {
    const mastery = new Map([
      ["concept_dcf_wacc", 0.8],
      ["concept_accounting_foundations", 0.4],
    ])
    const result = computeFirmReadiness(heat, mastery)
    // (0.9·0.8 + 0.3·0.4) / 1.2 = 0.7
    assert.ok(Math.abs((result.readiness ?? 0) - 0.7) < 1e-9)
    assert.deepEqual(
      result.topics.map((t) => t.topic),
      ["valuation", "accounting"],
    )
  })

  it("counts untouched concepts as zero", () => {
    const result = computeFirmReadiness(heat, new Map([["concept_dcf_wacc", 1]]))
    assert.ok(Math.abs((result.readiness ?? 0) - 0.75) < 1e-9)
  })

  it("is null when no topic maps to a concept", () => {
    const result = computeFirmReadiness(
      [{ firm_id: "f", topic_id: "markets", intensity: 1 }],
      new Map(),
    )
    assert.equal(result.readiness, null)
  })
})

describe("weeklyDelta", () => {
  it("compares with the latest snapshot on or before a week ago", () => {
    const snaps = [
      { local_date: "2026-09-10", readiness: 0.3 },
      { local_date: "2026-09-16", readiness: 0.4 },
      { local_date: "2026-09-20", readiness: 0.5 },
      { local_date: "2026-09-23", readiness: 0.62 },
    ]
    assert.equal(weeklyDelta(0.62, snaps, "2026-09-23"), 0.22)
  })

  it("falls back to the first earlier snapshot for new learners", () => {
    const snaps = [{ local_date: "2026-09-21", readiness: 0.2 }]
    assert.equal(weeklyDelta(0.35, snaps, "2026-09-23"), 0.15)
  })

  it("is null without history or readiness", () => {
    assert.equal(weeklyDelta(0.5, [{ local_date: "2026-09-23", readiness: 0.5 }], "2026-09-23"), null)
    assert.equal(weeklyDelta(null, [{ local_date: "2026-09-20", readiness: 0.5 }], "2026-09-23"), null)
  })
})

describe("rollUpConceptMastery", () => {
  it("averages attempted questions per concept and prefers concept records", () => {
    const rolled = rollUpConceptMastery(
      [
        { topic: "lbo", mastery: 0.9 },
        { topic: "lbo", mastery: 0.5 },
        { topic: "lbo", mastery: 0.7 },
        { topic: "valuation", mastery: 0.2 },
        { topic: null, mastery: 1 },
        { topic: "markets", mastery: 1 },
      ],
      [{ concept_id: "concept_dcf_wacc", mastery: 0.66 }],
    )
    const lbo = rolled.get("concept_lbo_paper_lbo")
    assert.ok(lbo)
    assert.ok(Math.abs(lbo.score - 0.7) < 1e-9)
    assert.equal(lbo.attempted, 3)
    assert.equal(lbo.proficient, 2)
    assert.equal(lbo.source, "rollup")
    const dcf = rolled.get("concept_dcf_wacc")
    assert.equal(dcf?.score, 0.66)
    assert.equal(dcf?.source, "concept")
    assert.equal(dcf?.attempted, 1)
    assert.equal(rolled.size, 2)
  })
})
