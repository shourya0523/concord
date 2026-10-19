import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { warrenMoodFor } from "./warren-mood"

const base = {
  goalMetToday: false,
  streakCurrent: 4,
  longestStreak: 6,
  localHour: 10,
  daysSinceCovered: 1,
  cardsLeft: 3,
}

describe("warrenMoodFor", () => {
  it("celebrates a met goal or a fresh achievement", () => {
    assert.equal(warrenMoodFor({ ...base, goalMetToday: true }).state, "celebrating")
    assert.equal(warrenMoodFor({ ...base, justEarned: 1 }).mood, "celebrating")
  })

  it("flags the streak at risk after 18:00 local with the goal open", () => {
    const reading = warrenMoodFor({ ...base, localHour: 18 })
    assert.equal(reading.state, "streak_at_risk")
    assert.equal(reading.mood, "concerned")
    assert.match(reading.message, /3 cards/)
    assert.equal(warrenMoodFor({ ...base, localHour: 17 }).state, "on_track")
    assert.equal(warrenMoodFor({ ...base, localHour: 21, streakCurrent: 0 }).state, "on_track")
  })

  it("welcomes back a learner after a lapse", () => {
    const reading = warrenMoodFor({ ...base, streakCurrent: 0, daysSinceCovered: 5 })
    assert.equal(reading.state, "returning")
    assert.equal(reading.mood, "encouraging")
  })

  it("greets brand-new learners", () => {
    const reading = warrenMoodFor({
      ...base,
      streakCurrent: 0,
      longestStreak: 0,
      daysSinceCovered: null,
    })
    assert.equal(reading.state, "fresh")
  })
})
