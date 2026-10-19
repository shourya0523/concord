import assert from "node:assert/strict"
import test from "node:test"

delete process.env.DATABASE_URL

const { aiContext, chargeAi, clearOrgKey, refundAi, saveOrgKey, setAccountPlan, usageSummary } = await import("./meter")
const { FREE_DAILY_LIMITS } = await import("./plans")

const now = new Date("2026-10-19T12:00:00Z")
let n = 0
const user = () => `meter_test_${Date.now()}_${n++}`

test("free allowance first, then refused without credits", async () => {
  const userId = user()
  for (let i = 0; i < FREE_DAILY_LIMITS.voice; i++) {
    const charge = await chargeAi({ userId, action: "voice", byok: false, now })
    assert.equal(charge.ok && charge.source, "free")
  }
  const over = await chargeAi({ userId, action: "voice", byok: false, now })
  assert.deepEqual(over, { ok: false, action: "voice", reason: "limit_reached" })

  // A new UTC day resets the allowance.
  const tomorrow = await chargeAi({ userId, action: "voice", byok: false, now: new Date("2026-10-20T00:00:01Z") })
  assert.equal(tomorrow.ok && tomorrow.source, "free")
})

test("credits pay once the free allowance is spent", async () => {
  const userId = user()
  await setAccountPlan({ userId, plan: "credits", now })
  for (let i = 0; i < FREE_DAILY_LIMITS.coaching; i++) await chargeAi({ userId, action: "coaching", byok: false, now })
  const paid = await chargeAi({ userId, action: "coaching", byok: false, now })
  assert.equal(paid.ok && paid.source, "credits")
  assert.equal(paid.ok && paid.credits, 2)

  const summary = await usageSummary(userId, now)
  assert.equal(summary.plan, "credits")
  assert.equal(summary.credits.balance, 1500 - 2)
  assert.equal(summary.today.coaching.used, FREE_DAILY_LIMITS.coaching)

  await refundAi(userId, paid, now)
  assert.equal((await usageSummary(userId, now)).credits.balance, 1500)
})

test("a ref is charged once", async () => {
  const userId = user()
  const first = await chargeAi({ userId, action: "coaching", byok: false, ref: "coach:s1", now })
  const again = await chargeAi({ userId, action: "coaching", byok: false, ref: "coach:s1", now })
  assert.equal(first.ok && first.repeat, false)
  assert.equal(again.ok && again.repeat, true)
  assert.equal((await usageSummary(userId, now)).today.coaching.used, 1)
})

test("Charter / Fleet org key: AI runs on it with no caps", async () => {
  const userId = user()
  const key = "sk-or-v1-orgorgorgorgorgorgorgorg0002"
  await setAccountPlan({ userId, plan: "team", now })
  assert.deepEqual(await saveOrgKey(userId, key), { last4: "0002" })

  const ctx = await aiContext(userId)
  assert.equal(ctx.byok, true)
  assert.equal(ctx.env.OPENROUTER_API_KEY, key)
  for (let i = 0; i < FREE_DAILY_LIMITS.voice + 5; i++) {
    const charge = await chargeAi({ userId, action: "voice", byok: ctx.byok, now })
    assert.equal(charge.ok && charge.source, "byok")
  }
  const summary = await usageSummary(userId, now)
  assert.deepEqual(summary.byok, { available: true, configured: true, last4: "0002" })
  assert.equal(summary.today.voice.used, 0)
  assert.ok(!JSON.stringify(summary).includes(key), "summary never carries the key")

  assert.equal(await clearOrgKey(userId), true)
  assert.equal(await clearOrgKey(userId), false)
  assert.equal((await aiContext(userId)).byok, false)
})

test("individual plans never run on a stored key", async () => {
  const userId = user()
  await setAccountPlan({ userId, plan: "custom", now })
  await saveOrgKey(userId, "sk-or-v1-orgorgorgorgorgorgorgorg0003")
  assert.equal((await aiContext(userId)).byok, true)

  // Seat moved to Supersonic without the key being cleared: metering applies again.
  await setAccountPlan({ userId, plan: "credits", now })
  const ctx = await aiContext(userId)
  assert.equal(ctx.byok, false)
  assert.notEqual(ctx.env.OPENROUTER_API_KEY, "sk-or-v1-orgorgorgorgorgorgorgorg0003")
  assert.equal((await usageSummary(userId, now)).byok.configured, false)
})
