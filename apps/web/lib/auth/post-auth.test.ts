import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  POST_AUTH_HOME,
  hasPrepProfile,
  homePathFor,
  postAuthPathFor,
} from "./post-auth"

describe("post-auth routing", () => {
  it("sends returning users to Today and new users to onboarding", () => {
    assert.equal(POST_AUTH_HOME, "/today")
    assert.equal(postAuthPathFor({ profile: { track: "IB" } }), "/today")
    assert.equal(postAuthPathFor({ profile: null }), "/onboarding")
    assert.equal(postAuthPathFor(null), "/onboarding")
  })

  it("falls back to the dashboard when the daily set is off", () => {
    assert.equal(homePathFor(true), "/today")
    assert.equal(homePathFor(false), "/dashboard")
    assert.equal(postAuthPathFor({ profile: { track: "PE" } }, homePathFor(false)), "/dashboard")
  })
})

describe("hasPrepProfile", () => {
  it("returns false for empty / missing profile", () => {
    assert.equal(hasPrepProfile(null), false)
    assert.equal(hasPrepProfile({}), false)
    assert.equal(hasPrepProfile({ profile: null }), false)
    assert.equal(
      hasPrepProfile({
        profile: {
          modes: [],
          track: null,
          role: null,
          interview_date: null,
          availability_minutes: null,
          focus_prompt: null,
          updated_at: null,
        },
      }),
      false,
    )
  })

  it("returns true when onboarding fields are present", () => {
    assert.equal(
      hasPrepProfile({
        profile: { modes: ["company_prep"], updated_at: null },
      }),
      true,
    )
    assert.equal(
      hasPrepProfile({
        profile: { track: "IB", updated_at: null },
      }),
      true,
    )
    assert.equal(
      hasPrepProfile({
        profile: { updated_at: "2026-08-01T00:00:00.000Z" },
      }),
      true,
    )
  })
})
