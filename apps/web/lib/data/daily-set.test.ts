import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { DrillInstance } from "@ibpe/contracts"
import {
  composeDailySet,
  dailySetSize,
  drillSeed,
  getOrCreateDailySet,
  markItemDone,
  summariseItems,
  type QuestionCandidate,
} from "./daily-set"
import { recordLearningActivity } from "./activity"
import { putPrepProfile } from "./profile"

const q = (id: string, topic: string | null = null): QuestionCandidate => ({
  question_id: id,
  prompt: `Question ${id}?`,
  topic,
  difficulty: null,
  reason: "test",
})

const drill: DrillInstance = {
  id: "drill:wacc_basic:d20260923abc",
  template_id: "wacc_basic",
  seed: "d20260923abc",
  topic: "valuation",
  concept_id: "concept_dcf_wacc",
  difficulty: "easy",
  prompt: "Compute WACC.",
  inputs: {},
  unit: "%",
}

describe("dailySetSize", () => {
  it("sizes from availability at ~1.5 min per card within 5–15", () => {
    assert.equal(dailySetSize(null), 8)
    assert.equal(dailySetSize(undefined), 8)
    assert.equal(dailySetSize(0), 8)
    assert.equal(dailySetSize(12), 8)
    assert.equal(dailySetSize(3), 5)
    assert.equal(dailySetSize(45), 15)
    assert.equal(dailySetSize(18), 12)
  })
})

describe("composeDailySet", () => {
  it("puts due reviews first, then new, firm heat and the drill", () => {
    const items = composeDailySet({
      size: 8,
      due: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"].map((id) => q(id)),
      fresh: ["n1", "n2", "n3"].map((id) => q(id, "lbo")),
      firmHeat: { ...q("h1", "valuation"), firm_id: "firm_gs" },
      drill: { instance: drill, reason: "drill" },
    })
    assert.equal(items.length, 8)
    assert.deepEqual(
      items.map((item) => item.kind),
      ["review", "review", "review", "review", "new", "new", "firm_heat", "drill"],
    )
    assert.equal(items[4]?.concept_id, "concept_lbo_paper_lbo")
    assert.equal(items[6]?.firm_id, "firm_gs")
    assert.equal(items[7]?.subject_id, drill.id)
  })

  it("tops up with new questions when few reviews are due", () => {
    const items = composeDailySet({
      size: 6,
      due: [q("r1")],
      fresh: ["n1", "n2", "n3", "n4", "n5", "n6"].map((id) => q(id)),
      firmHeat: null,
      drill: null,
    })
    assert.deepEqual(
      items.map((item) => item.id),
      ["review:r1", "new:n1", "new:n2", "new:n3", "new:n4", "new:n5"],
    )
  })

  it("never repeats a question", () => {
    const items = composeDailySet({
      size: 8,
      due: [q("x"), q("y")],
      fresh: [q("x"), q("z")],
      firmHeat: q("y"),
      drill: null,
    })
    const ids = items.map((item) => item.subject_id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.includes("z"))
  })

  it("handles an empty bank", () => {
    assert.deepEqual(composeDailySet({ size: 8, due: [], fresh: [], firmHeat: null, drill: null }), [])
  })
})

describe("item completion", () => {
  it("marks the first open item for a subject once", () => {
    const items = composeDailySet({ size: 5, due: [q("a")], fresh: [q("b")], firmHeat: null, drill: null })
    const marked = markItemDone(items, "a", 0.9, "2026-09-23T10:00:00Z")
    assert.ok(marked)
    assert.equal(marked[0]?.done_at, "2026-09-23T10:00:00Z")
    assert.equal(markItemDone(marked, "a", 0.9, "2026-09-23T10:05:00Z"), null)
    assert.deepEqual(summariseItems(marked), { completed: 1, allDone: false })
    const all = markItemDone(marked, "b", null, "2026-09-23T10:06:00Z")
    assert.deepEqual(summariseItems(all ?? []), { completed: 2, allDone: true })
  })

  it("derives a url-safe, stable drill seed", () => {
    const seed = drillSeed("user_1", "2026-09-23")
    assert.match(seed, /^[A-Za-z0-9_-]+$/)
    assert.equal(seed, drillSeed("user_1", "2026-09-23"))
    assert.notEqual(seed, drillSeed("user_1", "2026-09-24"))
  })
})

describe("getOrCreateDailySet (in-memory)", () => {
  it("builds once per local day and tracks completion from activity", async () => {
    const userId = `daily_set_test_${Math.random().toString(36).slice(2, 8)}`
    await putPrepProfile({ userId, input: { availability_minutes: 7, timezone: "Asia/Tokyo" } })
    const now = new Date("2026-09-23T16:00:00Z") // 01:00 on the 24th in Tokyo
    const first = await getOrCreateDailySet({ userId, now })
    assert.equal(first.set.local_date, "2026-09-24")
    assert.equal(first.set.timezone, "Asia/Tokyo")
    const again = await getOrCreateDailySet({ userId, now: new Date("2026-09-24T10:00:00Z") })
    assert.deepEqual(
      again.set.items.map((item) => item.id),
      first.set.items.map((item) => item.id),
    )
    if (first.set.items.length === 0) return // no local bank available
    assert.equal(first.set.goal, first.set.items.length)
    const item = first.set.items[0]!
    const activity = await recordLearningActivity({
      userId,
      kind: "attempt",
      subjectId: item.subject_id,
      score: 0.9,
      scoreSource: "deterministic",
      countsTowardGoal: true,
      at: new Date("2026-09-24T10:05:00Z"),
    })
    assert.deepEqual(activity?.daily_set, { completed: 1, goal: first.set.goal })
    const after = await getOrCreateDailySet({ userId, now: new Date("2026-09-24T10:06:00Z") })
    assert.equal(after.set.completed_count, 1)
    assert.ok(after.set.items[0]?.done_at)
  })
})
