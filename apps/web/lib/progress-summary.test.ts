import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyCheckpoint,
  streakFromDates,
  summariseAttempts,
  weekStart,
} from "./progress-summary"

const NOW = new Date("2026-09-23T15:00:00.000Z") // Wednesday

describe("weekStart", () => {
  it("returns the Monday of the UTC week", () => {
    assert.equal(weekStart(NOW), "2026-09-21")
    assert.equal(weekStart(new Date("2026-09-27T23:00:00Z")), "2026-09-21") // Sunday
    assert.equal(weekStart(new Date("2026-09-21T00:00:00Z")), "2026-09-21")
  })
})

describe("streakFromDates", () => {
  it("counts back from today, or from yesterday when today is idle", () => {
    assert.equal(streakFromDates(["2026-09-21", "2026-09-22", "2026-09-23"], NOW), 3)
    assert.equal(streakFromDates(["2026-09-21", "2026-09-22"], NOW), 2)
    assert.equal(streakFromDates(["2026-09-20"], NOW), 0)
    assert.equal(streakFromDates([], NOW), 0)
  })
})

describe("summariseAttempts", () => {
  it("builds activity, weekly accuracy and streak from attempts", () => {
    const summary = summariseAttempts(
      [
        { created_at: "2026-09-23T09:00:00Z", correct: true },
        { created_at: "2026-09-23T10:00:00Z", correct: false },
        { created_at: "2026-09-22T10:00:00Z", correct: null },
        { created_at: "2026-09-15T10:00:00Z", correct: true },
        { created_at: "2026-01-01T10:00:00Z", correct: true }, // outside both windows
      ],
      NOW,
    )
    assert.deepEqual(summary.activity, [
      { date: "2026-09-15", attempts: 1 },
      { date: "2026-09-22", attempts: 1 },
      { date: "2026-09-23", attempts: 2 },
    ])
    assert.deepEqual(summary.accuracy, [
      { week: "2026-09-14", attempts: 1, accuracy: 1 },
      { week: "2026-09-21", attempts: 2, accuracy: 0.5 },
    ])
    assert.equal(summary.streak_days, 2)
    assert.equal(summary.total_attempts, 5)
  })
})

describe("applyCheckpoint", () => {
  const ids = ["cp1", "cp2", "cp3", "cp4"]

  it("marks complete in roadmap order and computes percent", () => {
    const first = applyCheckpoint([], ids, "cp3", true)
    assert.deepEqual(first, { completed_checkpoint_ids: ["cp3"], percent: 25 })
    const second = applyCheckpoint(first.completed_checkpoint_ids, ids, "cp1", true)
    assert.deepEqual(second, { completed_checkpoint_ids: ["cp1", "cp3"], percent: 50 })
  })

  it("un-marks and drops ids that are no longer in the module", () => {
    const result = applyCheckpoint(["cp1", "stale", "cp2"], ids, "cp2", false)
    assert.deepEqual(result, { completed_checkpoint_ids: ["cp1"], percent: 25 })
  })

  it("is idempotent", () => {
    const once = applyCheckpoint(["cp1"], ids, "cp1", true)
    assert.deepEqual(once, { completed_checkpoint_ids: ["cp1"], percent: 25 })
  })
})
