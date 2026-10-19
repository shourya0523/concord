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
  currentPlanId,
  getPlan,
  planCtaHref,
} from "./plans"

test("three tiers in display order", () => {
  assert.deepEqual(
    PLANS.map((plan) => plan.id),
    ["individual", "team", "custom"],
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
  assert.equal(currentPlanId(), "individual")
})

test("Team, Custom and credits go to the contact email", () => {
  assert.equal(CONTACT_EMAIL, "sohumbalsara@gmail.com")
  assert.equal(contactHref("custom"), "mailto:sohumbalsara@gmail.com?subject=Concord%20Custom%20plan")
  assert.equal(creditsHref(), "mailto:sohumbalsara@gmail.com?subject=Concord%20credits%20(%2410%2Fmonth)")
  assert.equal(planCtaHref("team", false), contactHref("team"))
  assert.equal(planCtaHref("custom", true), contactHref("custom"))
})

test("Individual starts at sign-up, or settings when signed in", () => {
  assert.equal(planCtaHref("individual", false), "/sign-up")
  assert.equal(planCtaHref("individual", true), "/settings")
})
