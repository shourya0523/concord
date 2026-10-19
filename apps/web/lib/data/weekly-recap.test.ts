import assert from "node:assert/strict"
import test from "node:test"

import { totalsFrom, weekDays } from "./weekly-recap"

test("weekDays fills seven days from Monday, keeping recorded ones", () => {
  const days = weekDays("2026-10-05", [{ date: "2026-10-07", goal_met: true, freeze_used: false, xp: 42 }])
  assert.equal(days.length, 7)
  assert.equal(days[0]!.date, "2026-10-05")
  assert.equal(days[6]!.date, "2026-10-11")
  assert.equal(days[2]!.xp, 42)
  assert.equal(days[3]!.goal_met, false)
})

test("totalsFrom counts goal days and freeze-only days separately", () => {
  const totals = totalsFrom(
    [
      { date: "a", goal_met: true, freeze_used: false, xp: 30 },
      { date: "b", goal_met: false, freeze_used: true, xp: 0 },
      { date: "c", goal_met: true, freeze_used: false, xp: 12 },
    ],
    { graded_cards: 5, drills: 1, mocks: 0 },
  )
  assert.deepEqual(totals, { xp: 42, goal_days: 2, freeze_days: 1, graded_cards: 5, drills: 1, mocks: 0 })
})
