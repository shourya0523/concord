/**
 * Local calendar days (plan 2026-09-23-001 P5.1 / KD-6). Streaks, the daily
 * set and reminders all key off the learner's *local* day, never UTC.
 *
 * Local dates are plain `YYYY-MM-DD` strings. Day arithmetic works on the
 * calendar (via UTC midnight), so a DST change — a 23h or 25h local day —
 * never skips or repeats a date.
 */

export const DEFAULT_TIMEZONE = "UTC"

const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const formatterCache = new Map<string, Intl.DateTimeFormat>()

/** True when the runtime recognises the IANA zone name. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The zone to use: the stored one when valid, else UTC. */
export function safeTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE
}

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(tz)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    formatterCache.set(tz, formatter)
  }
  return formatter
}

type LocalParts = { year: string; month: string; day: string; hour: number; minute: number }

function localParts(date: Date, tz: string | null | undefined): LocalParts {
  const parts = partsFormatter(safeTimeZone(tz)).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00"
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Some runtimes render midnight as "24" even with h23.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  }
}

/** `YYYY-MM-DD` of `date` in `tz` (invalid/missing zone → UTC). */
export function localDate(date: Date, tz?: string | null): string {
  const { year, month, day } = localParts(date, tz)
  return `${year}-${month}-${day}`
}

/** Local wall-clock hour 0–23 of `date` in `tz`. */
export function localHour(date: Date, tz?: string | null): number {
  return localParts(date, tz).hour
}

function toUtcMidnight(day: string): number {
  const match = DATE_RE.exec(day)
  if (!match) throw new Error(`Invalid local date: ${day}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false
  const ms = toUtcMidnight(value)
  return new Date(ms).toISOString().slice(0, 10) === value
}

/** Calendar arithmetic on a local date (DST-safe: no wall-clock hours involved). */
export function addDays(day: string, n: number): string {
  return new Date(toUtcMidnight(day) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / DAY_MS)
}

/** Monday of the local date's ISO week. */
export function weekStartOf(day: string): string {
  const weekday = new Date(toUtcMidnight(day)).getUTCDay() || 7
  return addDays(day, -(weekday - 1))
}

/** Days from `today` until an interview date (`YYYY-MM-DD`), floored at 0. */
export function daysUntil(target: string | null | undefined, today: string): number | null {
  if (!target) return null
  const day = target.slice(0, 10)
  if (!isLocalDate(day)) return null
  return Math.max(0, daysBetween(today, day))
}

/** Latest of two local dates (nulls ignored). */
export function maxLocalDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return a >= b ? a : b
}

/** Browser zone for onboarding capture (client-only; falls back to UTC). */
export function detectTimeZone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return DEFAULT_TIMEZONE
  }
}
