import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PrepProfilePatchSchema,
  PrepProfileSchema,
  definedPatch,
  getPrepProfile,
  mergePrepProfile,
  putPrepProfile,
} from "./profile"

describe("PrepProfilePatchSchema", () => {
  it("leaves omitted fields undefined instead of defaulting them", () => {
    const parsed = PrepProfilePatchSchema.parse({ track: "PE" })
    assert.equal(parsed.track, "PE")
    assert.equal(parsed.notify_email, undefined)
    assert.equal(parsed.timezone, undefined)
    assert.deepEqual(definedPatch(parsed), { track: "PE" })
  })

  it("rejects out-of-range reminder hours", () => {
    assert.equal(PrepProfilePatchSchema.safeParse({ reminder_hour: 24 }).success, false)
  })
})

describe("mergePrepProfile", () => {
  const stored = PrepProfileSchema.parse({
    track: "IB",
    timezone: "Europe/London",
    reminder_hour: 19,
    notify_email: false,
    placement_completed_at: "2026-09-20T10:00:00.000Z",
  })

  it("keeps stored values for omitted keys", () => {
    const merged = mergePrepProfile(stored, { track: "PE", availability_minutes: 30 })
    assert.equal(merged.track, "PE")
    assert.equal(merged.availability_minutes, 30)
    assert.equal(merged.timezone, "Europe/London")
    assert.equal(merged.reminder_hour, 19)
    assert.equal(merged.notify_email, false)
    assert.equal(merged.placement_completed_at, "2026-09-20T10:00:00.000Z")
    assert.ok(merged.updated_at)
  })

  it("lets an explicit null clear a nullable field", () => {
    const merged = mergePrepProfile(stored, { reminder_hour: null })
    assert.equal(merged.reminder_hour, null)
    assert.equal(merged.timezone, "Europe/London")
  })

  it("drops unknown time zones", () => {
    assert.equal(mergePrepProfile(stored, { timezone: "Mars/Olympus" }).timezone, null)
    assert.equal(mergePrepProfile(null, { timezone: "Asia/Tokyo" }).timezone, "Asia/Tokyo")
  })
})

describe("putPrepProfile (in-memory)", () => {
  it("merges successive partial PUTs", async () => {
    const userId = `profile_test_${Date.now()}`
    await putPrepProfile({
      userId,
      input: PrepProfilePatchSchema.parse({
        track: "IB",
        timezone: "America/New_York",
        reminder_hour: 20,
      }),
    })
    // An older client that only knows the original onboarding fields.
    const second = await putPrepProfile({
      userId,
      input: PrepProfilePatchSchema.parse({ modes: ["company_prep"], availability_minutes: 45 }),
    })
    assert.equal(second.profile.timezone, "America/New_York")
    assert.equal(second.profile.reminder_hour, 20)
    assert.equal(second.profile.track, "IB")
    const read = await getPrepProfile(userId)
    assert.deepEqual(read.profile.modes, ["company_prep"])
    assert.equal(read.profile.reminder_hour, 20)
  })
})
