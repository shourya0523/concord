import assert from "node:assert/strict"
import test from "node:test"

import {
  balanceFor,
  creditPeriod,
  isAccountPlan,
  isAiAction,
  nextCreditReset,
  nextDailyReset,
  usageDay,
} from "./meter-core"

test("credits refill lazily in a new month", () => {
  const state = { monthlyCredits: 1500, creditsBalance: 4, creditsPeriod: "2026-09" }
  assert.equal(balanceFor(state, "2026-09"), 4)
  assert.equal(balanceFor(state, "2026-10"), 1500)
  assert.equal(balanceFor({ ...state, creditsPeriod: null }, "2026-10"), 1500)
})

test("periods and resets are UTC", () => {
  const now = new Date("2026-10-31T23:30:00-05:00") // 04:30 UTC on Nov 1
  assert.equal(usageDay(now), "2026-11-01")
  assert.equal(creditPeriod(now), "2026-11")
  assert.equal(nextDailyReset(now).toISOString(), "2026-11-02T00:00:00.000Z")
  assert.equal(nextCreditReset(new Date("2026-12-15T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z")
})

test("guards", () => {
  assert.ok(isAiAction("coaching"))
  assert.ok(!isAiAction("embed"))
  assert.ok(isAccountPlan("team"))
  assert.ok(!isAccountPlan("byok"))
})
