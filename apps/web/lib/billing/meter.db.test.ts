/**
 * Opt-in Postgres integration test for AI metering + BYOK (migration 064)
 * under RLS: free allowance, credits, monthly refill, refs, refunds, own key,
 * per-user isolation and no overspend under concurrent charges.
 *
 * Skipped unless RETENTION_DB_TEST_URL (scratch DB with migrations through
 * 064, connecting as the non-owner concord_app role) and RETENTION_DB_SHIM
 * (scripts/dev/neon_http_shim.py) are set — same harness as
 * retention.db.test.ts. Never point at Neon.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- opt-in local test, never a build input */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const DSN = process.env.RETENTION_DB_TEST_URL
const SHIM = process.env.RETENTION_DB_SHIM
const enabled = Boolean(DSN && SHIM)

describe("AI metering on Postgres (opt-in)", { skip: !enabled }, () => {
  it("charges own key → free → credits atomically, per user", async () => {
    const { neonConfig } = await import("@neondatabase/serverless")
    neonConfig.fetchEndpoint = SHIM as string
    process.env.DATABASE_URL = DSN
    const { resetDbClients } = await import("@ibpe/database")
    resetDbClients()

    const { aiContext, chargeAi, clearOrgKey, refundAi, saveOrgKey, setAccountPlan, usageSummary } = await import(
      "./meter"
    )
    const { FREE_DAILY_LIMITS } = await import("./plans")

    const stamp = Date.now()
    const alice = `billing_db_a_${stamp}`
    const bob = `billing_db_b_${stamp}`
    const now = new Date("2026-10-19T12:00:00Z")

    // Concurrent grades on a free account: exactly the daily allowance goes through.
    const burst = await Promise.all(
      Array.from({ length: FREE_DAILY_LIMITS.grade + 5 }, () =>
        chargeAi({ userId: alice, action: "grade", byok: false, now }),
      ),
    )
    assert.equal(burst.filter((c) => c.ok).length, FREE_DAILY_LIMITS.grade)
    assert.ok(burst.filter((c) => !c.ok).every((c) => !c.ok && c.reason === "limit_reached"))

    // Credits plan: spend after the free allowance, at the action's price.
    await setAccountPlan({ userId: alice, plan: "credits", now })
    const paid = await chargeAi({ userId: alice, action: "grade", byok: false, now })
    assert.equal(paid.ok && paid.source, "credits")
    let summary = await usageSummary(alice, now)
    assert.equal(summary.plan, "credits")
    assert.equal(summary.credits.balance, 1499)
    assert.equal(summary.today.grade.used, FREE_DAILY_LIMITS.grade)

    await refundAi(alice, paid, now)
    assert.equal((await usageSummary(alice, now)).credits.balance, 1500)

    // A new month refills lazily on the first charge.
    const nextMonth = new Date("2026-11-02T12:00:00Z")
    for (let i = 0; i < FREE_DAILY_LIMITS.grade; i++) await chargeAi({ userId: alice, action: "grade", byok: false, now: nextMonth })
    await chargeAi({ userId: alice, action: "grade", byok: false, now: nextMonth })
    assert.equal((await usageSummary(alice, nextMonth)).credits.balance, 1499)

    // Same ref twice: one charge.
    const first = await chargeAi({ userId: alice, action: "coaching", byok: false, ref: "coach:s1", now })
    const again = await chargeAi({ userId: alice, action: "coaching", byok: false, ref: "coach:s1", now })
    assert.equal(first.ok && first.repeat, false)
    assert.equal(again.ok && again.repeat, true)

    // Charter seat with the organisation's key: stored encrypted, AI runs on it, no caps.
    const key = `sk-or-v1-${"b".repeat(32)}9876`
    await setAccountPlan({ userId: bob, plan: "team", now })
    await saveOrgKey(bob, key)
    const ctx = await aiContext(bob)
    assert.equal(ctx.byok, true)
    assert.equal(ctx.env.OPENROUTER_API_KEY, key)
    for (let i = 0; i < FREE_DAILY_LIMITS.voice + 2; i++) {
      const charge = await chargeAi({ userId: bob, action: "voice", byok: true, now })
      assert.equal(charge.ok && charge.source, "byok")
    }
    summary = await usageSummary(bob, now)
    assert.deepEqual(summary.byok, { available: true, configured: true, last4: "9876" })
    assert.equal(summary.today.voice.used, 0)
    assert.equal(summary.plan, "team")

    // Isolation: Bob's key and plan don't leak to Alice.
    assert.equal((await aiContext(alice)).byok, false)
    assert.equal((await usageSummary(alice, now)).plan, "credits")

    // Off Charter, the key stops counting; then the admin clears it.
    await setAccountPlan({ userId: bob, plan: "credits", now })
    assert.equal((await aiContext(bob)).byok, false)
    assert.equal(await clearOrgKey(bob), true)
  })
})
