import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { localDate } from "@/lib/local-day"
import {
  EMPTY_STREAK,
  applyGoalMet,
  rolloverStreak,
  streakFromGoalDates,
  viewStreak,
  type StreakState,
} from "./streaks"

/** Meet the goal on each local day in order, settling rollovers first. */
function play(days: string[], start: StreakState = EMPTY_STREAK): StreakState {
  let state = start
  for (const day of days) {
    state = rolloverStreak(state, day).state
    state = applyGoalMet(state, day).state
  }
  return state
}

describe("applyGoalMet", () => {
  it("starts, extends and is idempotent per day", () => {
    let state = applyGoalMet(EMPTY_STREAK, "2026-09-20").state
    assert.equal(state.current, 1)
    state = applyGoalMet(state, "2026-09-21").state
    assert.equal(state.current, 2)
    const again = applyGoalMet(state, "2026-09-21")
    assert.equal(again.extended, false)
    assert.equal(again.state.current, 2)
    assert.equal(again.state.longest, 2)
  })

  it("earns one freeze per 7 goal days, capped at 2", () => {
    const days = Array.from({ length: 21 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10),
    )
    const after7 = play(days.slice(0, 7))
    assert.equal(after7.current, 7)
    assert.equal(after7.freezes, 1)
    const after14 = play(days.slice(0, 14))
    assert.equal(after14.freezes, 2)
    const after21 = play(days)
    assert.equal(after21.freezes, 2)
    assert.equal(after21.current, 21)
  })
})

describe("rolloverStreak", () => {
  const base: StreakState = {
    ...EMPTY_STREAK,
    current: 5,
    longest: 5,
    freezes: 1,
    last_goal_date: "2026-09-20",
  }

  it("does nothing while yesterday was covered", () => {
    const result = rolloverStreak(base, "2026-09-21")
    assert.equal(result.changed, false)
    assert.equal(result.state.current, 5)
  })

  it("spends a freeze on a single missed day", () => {
    const result = rolloverStreak(base, "2026-09-22")
    assert.deepEqual(result.freeze_dates, ["2026-09-21"])
    assert.equal(result.state.freezes, 0)
    assert.equal(result.state.current, 5)
    assert.equal(result.broken, false)
    // Freeze keeps the streak alive; meeting the goal today extends it.
    const met = applyGoalMet(result.state, "2026-09-22").state
    assert.equal(met.current, 6)
  })

  it("is idempotent once the freeze is recorded", () => {
    const first = rolloverStreak(base, "2026-09-22").state
    const second = rolloverStreak(first, "2026-09-22")
    assert.equal(second.changed, false)
    assert.equal(second.state.freezes, 0)
  })

  it("breaks without a freeze", () => {
    const result = rolloverStreak({ ...base, freezes: 0 }, "2026-09-22")
    assert.equal(result.broken, true)
    assert.equal(result.state.current, 0)
    assert.equal(result.state.longest, 5)
    assert.equal(applyGoalMet(result.state, "2026-09-22").state.current, 1)
  })

  it("breaks on a two-day gap even with two freezes", () => {
    const result = rolloverStreak({ ...base, freezes: 2 }, "2026-09-23")
    assert.equal(result.broken, true)
    assert.equal(result.state.freezes, 2)
  })

  it("counts a frozen day as covered for the following day", () => {
    const frozen = rolloverStreak(base, "2026-09-22").state
    // Goal not met on the 22nd either → the 22nd is a second miss, streak ends.
    const next = rolloverStreak(frozen, "2026-09-23")
    assert.equal(next.broken, true)
  })
})

describe("viewStreak", () => {
  it("flags at-risk and goal-met states", () => {
    const state: StreakState = { ...EMPTY_STREAK, current: 3, longest: 3, last_goal_date: "2026-09-22" }
    const open = viewStreak(state, "2026-09-23")
    assert.equal(open.at_risk, true)
    assert.equal(open.goal_met_today, false)
    const done = viewStreak({ ...state, last_goal_date: "2026-09-23" }, "2026-09-23")
    assert.equal(done.goal_met_today, true)
    assert.equal(done.at_risk, false)
    const lapsed = viewStreak(state, "2026-09-25")
    assert.equal(lapsed.current, 0)
    assert.equal(lapsed.longest, 3)
  })
})

describe("timezones", () => {
  it("counts a late-evening New York session on the local day", () => {
    const tz = "America/New_York"
    // 23:30 EDT on the 21st is 03:30Z on the 22nd; 20:00 EDT on the 22nd.
    const d1 = localDate(new Date("2026-09-22T03:30:00Z"), tz)
    const d2 = localDate(new Date("2026-09-23T00:00:00Z"), tz)
    assert.equal(d1, "2026-09-21")
    assert.equal(d2, "2026-09-22")
    assert.equal(play([d1, d2]).current, 2)
  })

  it("two local days that share a UTC date still make a 2-day streak", () => {
    const instants = ["2026-09-22T01:00:00Z", "2026-09-22T20:00:00Z"].map((iso) => new Date(iso))
    const ny = instants.map((at) => localDate(at, "America/New_York"))
    const utc = instants.map((at) => localDate(at, "UTC"))
    assert.deepEqual(ny, ["2026-09-21", "2026-09-22"])
    assert.deepEqual(utc, ["2026-09-22", "2026-09-22"])
    assert.equal(play(ny).current, 2)
    assert.equal(play(utc).current, 1)
  })

  it("survives the spring-forward DST night", () => {
    const tz = "America/New_York"
    const sessions = [
      "2026-03-07T23:00:00Z", // 18:00 EST on the 7th
      "2026-03-08T23:00:00Z", // 19:00 EDT on the 8th (23h day)
      "2026-03-10T03:30:00Z", // 23:30 EDT on the 9th
    ].map((iso) => localDate(new Date(iso), tz))
    assert.deepEqual(sessions, ["2026-03-07", "2026-03-08", "2026-03-09"])
    assert.equal(play(sessions).current, 3)
  })

  it("survives the fall-back DST night", () => {
    const tz = "Europe/London"
    const sessions = [
      "2026-10-24T22:30:00Z", // 23:30 BST on the 24th
      "2026-10-25T23:30:00Z", // 23:30 GMT on the 25th (25h day)
      "2026-10-26T08:00:00Z",
    ].map((iso) => localDate(new Date(iso), tz))
    assert.deepEqual(sessions, ["2026-10-24", "2026-10-25", "2026-10-26"])
    assert.equal(play(sessions).current, 3)
  })

  it("east-of-UTC learners roll to the next day before UTC does", () => {
    const tz = "Asia/Kolkata"
    const sessions = ["2026-09-21T19:00:00Z", "2026-09-22T19:00:00Z"].map((iso) =>
      localDate(new Date(iso), tz),
    )
    assert.deepEqual(sessions, ["2026-09-22", "2026-09-23"])
    assert.equal(play(sessions).current, 2)
  })
})

describe("streakFromGoalDates", () => {
  it("counts back from today or yesterday", () => {
    assert.equal(streakFromGoalDates(["2026-09-21", "2026-09-22", "2026-09-23"], "2026-09-23"), 3)
    assert.equal(streakFromGoalDates(["2026-09-21", "2026-09-22"], "2026-09-23"), 2)
    assert.equal(streakFromGoalDates(["2026-09-20"], "2026-09-23"), 0)
    assert.equal(streakFromGoalDates([], "2026-09-23"), 0)
  })
})
