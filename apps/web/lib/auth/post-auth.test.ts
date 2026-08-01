import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { hasPrepProfile } from "./post-auth"

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
