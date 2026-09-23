import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getRetentionState,
  listAchievements,
  planActivity,
  recordLearningActivity,
  type ActivityReadState,
} from "./activity"
import { putPrepProfile } from "./profile"
import { EMPTY_STREAK } from "./streaks"

const uid = (label: string) => `activity_test_${label}_${Math.random().toString(36).slice(2, 8)}`

function attempt(userId: string, at: string, overrides: Partial<Parameters<typeof recordLearningActivity>[0]> = {}) {
  return recordLearningActivity({
    userId,
    kind: "attempt",
    subjectId: `q_${Math.random().toString(36).slice(2, 10)}`,
    score: 0.8,
    scoreSource: "llm",
    countsTowardGoal: true,
    at: new Date(at),
    ...overrides,
  })
}

describe("planActivity", () => {
  const read: ActivityReadState = {
    streak: EMPTY_STREAK,
    today: { cards_done: 4, goal: 5, goal_met: false, xp: 30, freeze_used: false },
    set_goal: 5,
    repeated: false,
    counts: { graded_cards: 9, drills: 0, mocks: 0 },
  }

  it("predicts the goal-meeting card and counts", () => {
    const plan = planActivity(read, { kind: "attempt", score: 0.9, scoreSource: "llm", countsTowardGoal: true }, "2026-09-23", 8)
    assert.equal(plan.goal, 5)
    assert.equal(plan.cards_inc, 1)
    assert.equal(plan.goal_met_now, true)
    assert.equal(plan.xp_event, 9)
    assert.equal(plan.counts_after.graded_cards, 10)
    assert.equal(plan.streak_if_met.current, 1)
  })

  it("does not count reveal-copy or mocks as cards", () => {
    const copy = planActivity(read, { kind: "attempt", score: 0.9, scoreSource: "reveal_copy", countsTowardGoal: false }, "2026-09-23", 8)
    assert.equal(copy.cards_inc, 0)
    assert.equal(copy.xp_event, 0)
    assert.equal(copy.goal_met_now, false)
    const mock = planActivity(read, { kind: "mock_complete", score: null, scoreSource: "llm", countsTowardGoal: true }, "2026-09-23", 8)
    assert.equal(mock.cards_inc, 0)
    assert.equal(mock.xp_event, 50)
    assert.equal(mock.counts_after.mocks, 1)
  })

  it("does not count a retry of the same subject as another card", () => {
    const retry = planActivity(
      { ...read, repeated: true },
      { kind: "drill", score: 1, scoreSource: "numeric", countsTowardGoal: true },
      "2026-09-23",
      8,
    )
    assert.equal(retry.cards_inc, 0)
    assert.equal(retry.goal_met_now, false)
    assert.equal(retry.xp_event, 5)
  })
})

describe("recordLearningActivity (in-memory)", () => {
  it("meets the daily goal once, awards XP + bonus and starts a streak", async () => {
    const userId = uid("goal")
    await putPrepProfile({ userId, input: { availability_minutes: 7, timezone: "UTC" } }) // 5-card goal
    let last = null
    for (let i = 0; i < 5; i++) last = await attempt(userId, `2026-09-23T10:0${i}:00Z`)
    assert.ok(last)
    assert.equal(last.streak?.current, 1)
    assert.equal(last.streak?.goal_met_today, true)
    assert.equal(last.xp_awarded, 8 + 20)
    assert.equal(last.xp_total, 5 * 8 + 20)
    const sixth = await attempt(userId, "2026-09-23T11:00:00Z")
    assert.equal(sixth?.xp_awarded, 8)
    assert.equal(sixth?.streak?.current, 1)
  })

  it("halves XP for the same subject within 24 h and ignores reveal-copy", async () => {
    const userId = uid("repeat")
    const first = await attempt(userId, "2026-09-23T10:00:00Z", { subjectId: "q_same", score: 1 })
    const again = await attempt(userId, "2026-09-23T12:00:00Z", { subjectId: "q_same", score: 1 })
    const later = await attempt(userId, "2026-09-24T13:00:00Z", { subjectId: "q_same", score: 1 })
    const copied = await attempt(userId, "2026-09-24T14:00:00Z", {
      subjectId: "q_other",
      scoreSource: "reveal_copy",
      countsTowardGoal: false,
    })
    assert.equal(first?.xp_awarded, 10)
    assert.equal(again?.xp_awarded, 5)
    assert.equal(later?.xp_awarded, 10)
    assert.equal(copied?.xp_awarded, 0)
  })

  it("uses the learner's local day for the streak", async () => {
    const userId = uid("tz")
    await putPrepProfile({ userId, input: { availability_minutes: 1, timezone: "America/Los_Angeles" } })
    // Goal = 5 cards. 20:00 PDT on the 21st and 20:00 PDT on the 22nd are
    // both 03:00Z the next UTC day.
    for (let i = 0; i < 5; i++) await attempt(userId, `2026-09-22T03:0${i}:00Z`)
    let result = null
    for (let i = 0; i < 5; i++) result = await attempt(userId, `2026-09-23T03:0${i}:00Z`)
    assert.equal(result?.streak?.local_date, "2026-09-22")
    assert.equal(result?.streak?.current, 2)
  })

  it("spends an earned freeze on a single missed day", async () => {
    const userId = uid("freeze")
    await putPrepProfile({ userId, input: { availability_minutes: 1, timezone: "UTC" } })
    for (let day = 1; day <= 7; day++) {
      for (let i = 0; i < 5; i++) await attempt(userId, `2026-09-0${day}T09:0${i}:00Z`)
    }
    const beforeGap = await getRetentionState({ userId, now: new Date("2026-09-07T20:00:00Z") })
    assert.equal(beforeGap.streak.current, 7)
    assert.equal(beforeGap.streak.freezes, 1)
    // Skip the 8th; opening the app on the 9th spends the freeze.
    const onReturn = await getRetentionState({ userId, now: new Date("2026-09-09T08:00:00Z") })
    assert.deepEqual(onReturn.rollover.freeze_dates, ["2026-09-08"])
    assert.equal(onReturn.streak.current, 7)
    assert.equal(onReturn.streak.freezes, 0)
    let result = null
    for (let i = 0; i < 5; i++) result = await attempt(userId, `2026-09-09T09:0${i}:00Z`)
    assert.equal(result?.streak?.current, 8)
    const ids = (await listAchievements(userId)).items.map((a) => a.id)
    assert.ok(ids.includes("streak_3"))
    assert.ok(ids.includes("streak_7"))
  })

  it("awards first-drill and first-mock achievements", async () => {
    const userId = uid("ach")
    const drill = await recordLearningActivity({
      userId,
      kind: "drill",
      subjectId: "drill:wacc_basic:abc",
      score: 1,
      scoreSource: "numeric",
      countsTowardGoal: true,
      at: new Date("2026-09-23T10:00:00Z"),
    })
    assert.deepEqual(drill?.achievements_earned.map((a) => a.id), ["first_drill"])
    const mock = await recordLearningActivity({
      userId,
      kind: "mock_complete",
      score: null,
      scoreSource: "llm",
      countsTowardGoal: false,
      at: new Date("2026-09-23T11:00:00Z"),
    })
    assert.equal(mock?.xp_awarded, 50)
    assert.deepEqual(mock?.achievements_earned.map((a) => a.id), ["first_mock"])
  })
})
