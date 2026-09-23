import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DAILY_GOAL_BONUS, MOCK_COMPLETE_BONUS, levelForXp, xpForEvent } from "./xp"

const graded = {
  kind: "attempt" as const,
  score: 0.83,
  scoreSource: "llm",
  countsTowardGoal: true,
  repeatedWithin24h: false,
}

describe("xpForEvent", () => {
  it("awards round(10 × score) per graded attempt", () => {
    assert.equal(xpForEvent(graded), 8)
    assert.equal(xpForEvent({ ...graded, score: 1 }), 10)
    assert.equal(xpForEvent({ ...graded, score: 0.04 }), 0)
  })

  it("halves repeats within 24 h", () => {
    assert.equal(xpForEvent({ ...graded, score: 1, repeatedWithin24h: true }), 5)
    assert.equal(xpForEvent({ ...graded, score: 0.83, repeatedWithin24h: true }), 4)
  })

  it("awards nothing for reveal-copy, empty self-rating or missing score", () => {
    assert.equal(xpForEvent({ ...graded, scoreSource: "reveal_copy" }), 0)
    assert.equal(xpForEvent({ ...graded, scoreSource: "self", countsTowardGoal: false }), 0)
    assert.equal(xpForEvent({ ...graded, score: null }), 0)
  })

  it("gives the fixed mock bonus", () => {
    assert.equal(xpForEvent({ ...graded, kind: "mock_complete", score: null }), MOCK_COMPLETE_BONUS)
    assert.equal(DAILY_GOAL_BONUS, 20)
  })

  it("scores drills like attempts", () => {
    assert.equal(xpForEvent({ ...graded, kind: "drill", score: 1, scoreSource: "numeric" }), 10)
  })
})

describe("levelForXp", () => {
  it("maps XP onto the level table", () => {
    assert.deepEqual(levelForXp(0), { level: 1, floor: 0, next: 100, progress: 0 })
    assert.equal(levelForXp(99).level, 1)
    assert.equal(levelForXp(100).level, 2)
    assert.equal(levelForXp(250).level, 3)
    assert.equal(levelForXp(1999).level, 5)
    assert.equal(levelForXp(2000).level, 6)
    assert.equal(levelForXp(175).progress, 0.5)
  })

  it("keeps growing past the table", () => {
    const high = levelForXp(20000)
    assert.ok(high.level > 10)
    assert.ok(high.next > 20000)
    assert.ok(high.floor <= 20000)
  })
})
