import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  achievementCatalogue,
  conceptCleared,
  describeAchievement,
  evaluateAchievements,
  satisfiedAchievements,
  type AchievementContext,
} from "./achievements"

const empty: AchievementContext = {
  streak: { current: 0, longest: 0 },
  graded_cards: 0,
  drills: 0,
  mocks: 0,
}

const ids = (ctx: AchievementContext) => satisfiedAchievements(ctx).map((a) => a.id)

describe("satisfiedAchievements", () => {
  it("is empty for a new learner", () => {
    assert.deepEqual(ids(empty), [])
  })

  it("awards streak milestones from current or longest", () => {
    assert.deepEqual(ids({ ...empty, streak: { current: 3, longest: 3 } }), ["streak_3"])
    assert.deepEqual(ids({ ...empty, streak: { current: 0, longest: 7 } }), ["streak_3", "streak_7"])
    assert.ok(ids({ ...empty, streak: { current: 30, longest: 30 } }).includes("streak_30"))
  })

  it("awards card, drill and mock milestones", () => {
    assert.deepEqual(ids({ ...empty, graded_cards: 10 }), ["graded_10"])
    assert.deepEqual(ids({ ...empty, graded_cards: 100 }), ["graded_10", "graded_100"])
    assert.deepEqual(ids({ ...empty, drills: 1 }), ["first_drill"])
    assert.deepEqual(ids({ ...empty, mocks: 1 }), ["first_mock"])
  })

  it("clears a concept only with ≥3 attempted, all proficient", () => {
    assert.equal(conceptCleared({ concept_id: "c", topic: null, attempted: 2, proficient: 2 }), false)
    assert.equal(conceptCleared({ concept_id: "c", topic: null, attempted: 3, proficient: 2 }), false)
    assert.equal(conceptCleared({ concept_id: "c", topic: null, attempted: 3, proficient: 3 }), true)
    const earned = satisfiedAchievements({
      ...empty,
      concepts: [{ concept_id: "concept_dcf_wacc", topic: "valuation", attempted: 4, proficient: 4 }],
    })
    assert.equal(earned[0]?.id, "concept_cleared:concept_dcf_wacc")
    assert.equal(earned[0]?.title, "Valuation / DCF cleared")
  })

  it("awards firm readiness at 50% and 80%", () => {
    const firms = [
      { firm_id: "firm_goldman-sachs", firm_name: "Goldman Sachs", readiness: 0.62 },
      { firm_id: "firm_kkr", firm_name: "KKR", readiness: 0.8 },
      { firm_id: "firm_x", readiness: null },
    ]
    assert.deepEqual(ids({ ...empty, firms }), [
      "readiness_50:firm_goldman-sachs",
      "readiness_50:firm_kkr",
      "readiness_80:firm_kkr",
    ])
  })
})

describe("evaluateAchievements", () => {
  it("returns only achievements not yet earned", () => {
    const ctx = { ...empty, graded_cards: 12, drills: 1 }
    assert.deepEqual(
      evaluateAchievements(ctx, ["graded_10"]).map((a) => a.id),
      ["first_drill"],
    )
    assert.deepEqual(evaluateAchievements(ctx, ["graded_10", "first_drill"]), [])
  })
})

describe("describeAchievement", () => {
  it("describes static and dynamic ids", () => {
    assert.equal(describeAchievement("streak_7").title, "7-day streak")
    assert.equal(
      describeAchievement("concept_cleared:concept_x", { title: "LBO cleared" }).title,
      "LBO cleared",
    )
    assert.equal(describeAchievement("readiness_80:firm_kkr").title, "kkr 80% ready")
    assert.ok(achievementCatalogue().length >= 7)
  })
})
