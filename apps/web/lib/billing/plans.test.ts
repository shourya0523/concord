import assert from "node:assert/strict"
import test from "node:test"

import {
  CONTACT_EMAIL,
  CREDITS_PRICE_USD,
  ORG_KEY_PLANS,
  PLANS,
  SEAT_PRICE_USD,
  TEAM_MIN_SEATS,
  contactHref,
  getPlan,
  planCtaHref,
} from "./plans"

test("four themed tiers in display order", () => {
  assert.deepEqual(
    PLANS.map((plan) => [plan.id, plan.name, plan.kind]),
    [
      ["free", "Standby", "Individual"],
      ["credits", "Supersonic", "Individual"],
      ["team", "Charter", "Team"],
      ["custom", "Fleet", "Custom"],
    ],
  )
})

test("Standby is free, Supersonic $10, Charter $5 a seat", () => {
  assert.equal(getPlan("free").price, "Free")
  assert.equal(CREDITS_PRICE_USD, 10)
  assert.equal(getPlan("credits").price, "$10")
  assert.match(getPlan("credits").cadence, /1,500 credits/)
  assert.equal(SEAT_PRICE_USD, 5)
  assert.equal(getPlan("team").price, "$5")
  assert.match(getPlan("team").cadence, new RegExp(`${TEAM_MIN_SEATS} seat minimum`))
})

test("own key is a Charter / Fleet perk only", () => {
  assert.deepEqual([...ORG_KEY_PLANS], ["team", "custom"])
  for (const plan of PLANS) {
    const mentionsKey = plan.features.some((f) => /OpenRouter key/.test(f))
    assert.equal(mentionsKey, ORG_KEY_PLANS.includes(plan.id), plan.id)
  }
})

test("plan requests go to the contact email with the account ID", () => {
  assert.equal(CONTACT_EMAIL, "sohumbalsara@gmail.com")
  assert.equal(contactHref("custom"), "mailto:sohumbalsara@gmail.com?subject=Concord%20Fleet%20(Custom)%20plan")
  assert.equal(
    contactHref("credits", "user_1"),
    "mailto:sohumbalsara@gmail.com?subject=Concord%20Supersonic%20(Individual)%20plan&body=Account%20ID%3A%20user_1%0A%0A",
  )
  assert.equal(planCtaHref("team", false), contactHref("team"))
  assert.equal(planCtaHref("custom", true), contactHref("custom"))
})

test("individual plans start at sign-up, or settings when signed in", () => {
  assert.equal(planCtaHref("free", false), "/sign-up")
  assert.equal(planCtaHref("free", true), "/settings")
  assert.equal(planCtaHref("credits", false), "/sign-up?next=%2Fsettings")
  assert.equal(planCtaHref("credits", true), "/settings")
})
