import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addDays,
  daysBetween,
  daysUntil,
  isLocalDate,
  isValidTimeZone,
  localDate,
  localHour,
  maxLocalDate,
  safeTimeZone,
  weekStartOf,
} from "./local-day"

describe("localDate", () => {
  it("uses the learner's zone, not UTC", () => {
    const at = new Date("2026-03-10T03:30:00Z")
    assert.equal(localDate(at, "UTC"), "2026-03-10")
    assert.equal(localDate(at, "America/New_York"), "2026-03-09")
    assert.equal(localDate(at, "Asia/Tokyo"), "2026-03-10")
    assert.equal(localDate(new Date("2026-03-10T15:30:00Z"), "Asia/Tokyo"), "2026-03-11")
  })

  it("falls back to UTC for missing or invalid zones", () => {
    const at = new Date("2026-03-10T23:30:00Z")
    assert.equal(localDate(at), "2026-03-10")
    assert.equal(localDate(at, null), "2026-03-10")
    assert.equal(localDate(at, "Not/AZone"), "2026-03-10")
    assert.equal(safeTimeZone("Not/AZone"), "UTC")
    assert.equal(isValidTimeZone("Europe/London"), true)
    assert.equal(isValidTimeZone(""), false)
  })

  it("reports the local hour across DST changes", () => {
    // US DST starts 2026-03-08 02:00 local: 07:30Z is 03:30 EDT (not 02:30).
    assert.equal(localHour(new Date("2026-03-08T07:30:00Z"), "America/New_York"), 3)
    assert.equal(localHour(new Date("2026-03-08T06:30:00Z"), "America/New_York"), 1)
    assert.equal(localHour(new Date("2026-01-01T00:15:00Z"), "UTC"), 0)
  })

  it("keeps a 23-hour DST day as one date", () => {
    const tz = "America/New_York"
    // Local 2026-03-08 runs 05:00Z → 04:00Z next day (23h).
    assert.equal(localDate(new Date("2026-03-08T05:00:00Z"), tz), "2026-03-08")
    assert.equal(localDate(new Date("2026-03-09T03:59:00Z"), tz), "2026-03-08")
    assert.equal(localDate(new Date("2026-03-09T04:00:00Z"), tz), "2026-03-09")
  })

  it("keeps a 25-hour DST day as one date", () => {
    const tz = "Europe/London"
    // BST ends 2026-10-25: local day runs 23:00Z (24th) → 00:00Z (26th).
    assert.equal(localDate(new Date("2026-10-24T23:00:00Z"), tz), "2026-10-25")
    assert.equal(localDate(new Date("2026-10-25T23:59:00Z"), tz), "2026-10-25")
    assert.equal(localDate(new Date("2026-10-26T00:00:00Z"), tz), "2026-10-26")
  })
})

describe("calendar arithmetic", () => {
  it("adds days across month, year and DST boundaries", () => {
    assert.equal(addDays("2026-03-07", 1), "2026-03-08")
    assert.equal(addDays("2026-03-08", 1), "2026-03-09")
    assert.equal(addDays("2026-10-25", 1), "2026-10-26")
    assert.equal(addDays("2026-12-31", 1), "2027-01-01")
    assert.equal(addDays("2026-03-01", -1), "2026-02-28")
    assert.equal(addDays("2028-03-01", -1), "2028-02-29")
  })

  it("counts whole days between dates", () => {
    assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2)
    assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2)
    assert.equal(daysBetween("2026-03-09", "2026-03-07"), -2)
    assert.equal(daysBetween("2026-09-23", "2026-09-23"), 0)
  })

  it("finds the ISO week start", () => {
    assert.equal(weekStartOf("2026-09-23"), "2026-09-21")
    assert.equal(weekStartOf("2026-09-21"), "2026-09-21")
    assert.equal(weekStartOf("2026-09-27"), "2026-09-21")
  })

  it("counts days until an interview", () => {
    assert.equal(daysUntil("2026-10-01", "2026-09-23"), 8)
    assert.equal(daysUntil("2026-10-01T00:00:00Z", "2026-09-23"), 8)
    assert.equal(daysUntil("2026-09-01", "2026-09-23"), 0)
    assert.equal(daysUntil(null, "2026-09-23"), null)
    assert.equal(daysUntil("soon", "2026-09-23"), null)
  })

  it("validates and compares local dates", () => {
    assert.equal(isLocalDate("2026-02-30"), false)
    assert.equal(isLocalDate("2026-02-28"), true)
    assert.equal(maxLocalDate("2026-01-02", "2026-01-01"), "2026-01-02")
    assert.equal(maxLocalDate(null, "2026-01-01"), "2026-01-01")
    assert.equal(maxLocalDate(null, null), null)
  })
})
