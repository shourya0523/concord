import assert from "node:assert/strict"
import test from "node:test"

import {
  CONTACT_EMAIL,
  CREDITS_PRICE_USD,
  PLANS,
  SEAT_PRICE_USD,
  TEAM_MIN_SEATS,
  contactHref,
  creditsHref,
  getPlan,
  planCtaHref,
} from "./plans"

test("four tiers in display order", () => {
  assert.deepEqual(
    PLANS.map((plan) => plan.id),
    ["individual", "byok", "team", "custom"],
  )
})

test("Individual is free with a $10 credit pack; Team is $5 a seat", () => {
  const individual = getPlan("individual")
  assert.equal(individual.price, "Free")
  assert.equal(CREDITS_PRICE_USD, 10)
  assert.match(individual.upgrade ?? "", /^or \$10\/month for 1,500 credits$/)
  assert.equal(SEAT_PRICE_USD, 5)
  assert.equal(getPlan("team").price, "$5")
  assert.match(getPlan("team").cadence, new RegExp(`${TEAM_MIN_SEATS} seat minimum`))
})

test("Team, Custom and credits go to the contact email", () => {
  assert.equal(CONTACT_EMAIL, "sohumbalsara@gmail.com")
  assert.equal(contactHref("custom"), "mailto:sohumbalsara@gmail.com?subject=Concord%20Custom%20plan")
  assert.equal(creditsHref(), "mailto:sohumbalsara@gmail.com?subject=Concord%20credits%20(%2410%2Fmonth)")
  assert.equal(planCtaHref("team", false), contactHref("team"))
  assert.equal(planCtaHref("custom", true), contactHref("custom"))
  assert.equal(
    creditsHref("user_1"),
    "mailto:sohumbalsara@gmail.com?subject=Concord%20credits%20(%2410%2Fmonth)&body=Account%20ID%3A%20user_1%0A%0A",
  )
})

test("own key goes to the key form in Settings", () => {
  assert.equal(planCtaHref("byok", true), "/settings#byok")
  assert.equal(planCtaHref("byok", false), "/sign-up?next=%2Fsettings")
})

test("Individual starts at sign-up, or settings when signed in", () => {
  assert.equal(planCtaHref("individual", false), "/sign-up")
  assert.equal(planCtaHref("individual", true), "/settings")
})
