import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatHour,
  localHourOfUtc,
  timeZoneLabel,
  timeZoneOptions,
  urlBase64ToUint8Array,
} from "./client"

describe("notification client helpers", () => {
  it("decodes a base64url VAPID key", () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0x00, 0x10, 0x41])
    const b64url = Buffer.from(bytes).toString("base64url")
    assert.deepEqual([...urlBase64ToUint8Array(b64url)], [...bytes])
  })

  it("formats hours", () => {
    assert.equal(formatHour(0), "12:00 am")
    assert.equal(formatHour(7), "7:00 am")
    assert.equal(formatHour(12), "12:00 pm")
    assert.equal(formatHour(20), "8:00 pm")
  })

  it("puts detected and saved zones first without duplicates or invalid zones", () => {
    const options = timeZoneOptions("Asia/Kathmandu", "Europe/London", "Not/AZone", null)
    assert.equal(options[0], "Asia/Kathmandu")
    assert.equal(options[1], "Europe/London")
    assert.equal(options.filter((z) => z === "Europe/London").length, 1)
    assert.ok(!options.includes("Not/AZone"))
    assert.ok(options.includes("UTC"))
  })

  it("labels zones", () => {
    assert.equal(timeZoneLabel("America/New_York"), "New York (America)")
    assert.equal(timeZoneLabel("UTC"), "UTC")
  })
})

describe("localHourOfUtc", () => {
  it("converts the daily run hour into the user's local hour", () => {
    const summer = new Date("2026-07-01T00:00:00Z")
    assert.equal(localHourOfUtc(13, "UTC", summer), 13)
    assert.equal(localHourOfUtc(13, "America/New_York", summer), 9)
    assert.equal(localHourOfUtc(13, "Asia/Kolkata", summer), 18)
    assert.equal(localHourOfUtc(13, "Europe/London", new Date("2026-12-01T00:00:00Z")), 13)
    assert.equal(localHourOfUtc(13, "Not/AZone", summer), 13)
  })
})
