import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  describeDue,
  INITIAL_REVIEW_STATE,
  ratingFromScore,
  scheduleReview,
} from "./review-schedule"

const NOW = new Date("2026-09-22T12:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

describe("scheduleReview", () => {
  it("re-queues 'again' within the same session and lowers ease", () => {
    const next = scheduleReview(null, "again", NOW)
    assert.equal(next.interval_days, 0)
    assert.equal(next.repetitions, 0)
    assert.ok(next.ease < INITIAL_REVIEW_STATE.ease)
    assert.equal(new Date(next.due_at).getTime() - NOW.getTime(), 10 * 60 * 1000)
  })

  it("grows 'good' intervals 1 → 3 → interval × ease", () => {
    const first = scheduleReview(null, "good", NOW)
    assert.equal(first.interval_days, 1)
    const second = scheduleReview(first, "good", NOW)
    assert.equal(second.interval_days, 3)
    const third = scheduleReview(second, "good", NOW)
    assert.equal(third.interval_days, Math.round(3 * 2.5))
    assert.equal(new Date(third.due_at).getTime() - NOW.getTime(), third.interval_days * DAY)
  })

  it("schedules 'easy' further out than 'good' and 'hard' closer", () => {
    const base = scheduleReview(scheduleReview(null, "good", NOW), "good", NOW)
    const hard = scheduleReview(base, "hard", NOW)
    const good = scheduleReview(base, "good", NOW)
    const easy = scheduleReview(base, "easy", NOW)
    assert.ok(hard.interval_days < good.interval_days)
    assert.ok(good.interval_days < easy.interval_days)
  })

  it("resets progress after a lapse", () => {
    let state = scheduleReview(null, "good", NOW)
    state = scheduleReview(state, "good", NOW)
    state = scheduleReview(state, "again", NOW)
    assert.equal(state.repetitions, 0)
    assert.equal(scheduleReview(state, "good", NOW).interval_days, 1)
  })

  it("keeps ease within bounds and caps the interval", () => {
    let state = scheduleReview(null, "again", NOW)
    for (let i = 0; i < 20; i++) state = scheduleReview(state, "again", NOW)
    assert.equal(state.ease, 1.3)
    let long = scheduleReview(null, "easy", NOW)
    for (let i = 0; i < 20; i++) long = scheduleReview(long, "easy", NOW)
    assert.equal(long.ease, 3)
    assert.equal(long.interval_days, 120)
  })
})

describe("ratingFromScore", () => {
  it("maps the study page's rating values onto buttons", () => {
    assert.equal(ratingFromScore(0.25), "again")
    assert.equal(ratingFromScore(0.5), "hard")
    assert.equal(ratingFromScore(0.75), "good")
    assert.equal(ratingFromScore(1), "easy")
    assert.equal(ratingFromScore(null), "hard")
  })
})

describe("describeDue", () => {
  it("labels near and far due dates", () => {
    assert.equal(describeDue(new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(), NOW), "in 10 min")
    assert.equal(describeDue(new Date(NOW.getTime() + DAY).toISOString(), NOW), "tomorrow")
    assert.equal(describeDue(new Date(NOW.getTime() + 6 * DAY).toISOString(), NOW), "in 6 days")
    assert.equal(describeDue(new Date(NOW.getTime() - 1000).toISOString(), NOW), "now")
  })
})
