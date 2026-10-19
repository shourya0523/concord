/**
 * Timezone helpers for reminders and leagues — pure, Intl-based, no deps.
 *
 * Local dates are ISO `YYYY-MM-DD` strings (the shape Postgres `date`
 * columns round-trip as). Arithmetic on them is done in UTC so it is
 * immune to DST.
 */

export const DEFAULT_TIMEZONE = "UTC"

export type LocalParts = {
  /** IANA zone actually used (falls back to UTC when invalid/null). */
  timeZone: string
  /** Local calendar date `YYYY-MM-DD`. */
  localDate: string
  /** Local hour 0–23. */
  hour: number
  minute: number
  /** 0 = Sunday … 6 = Saturday (local). */
  weekday: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false
  try {
    formatterFor(value)
    return true
  } catch {
    return false
  }
}

/** Resolve a stored preference to a usable zone (UTC when unset/invalid). */
export function resolveTimeZone(value: string | null | undefined): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIMEZONE
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Wall-clock parts of `now` in `timeZone`. */
export function localParts(now: Date, timeZone: string | null | undefined): LocalParts {
  const zone = resolveTimeZone(timeZone)
  const parts: Record<string, string> = {}
  for (const part of formatterFor(zone).formatToParts(now)) {
    parts[part.type] = part.value
  }
  // Some engines render midnight as "24" even with h23.
  const hour = Number(parts.hour) % 24
  return {
    timeZone: zone,
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
  }
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid ISO date: ${value}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` plus `days` (negative to go back). */
export function addDays(localDate: string, days: number): string {
  const date = parseIsoDate(localDate)
  date.setUTCDate(date.getUTCDate() + days)
  return formatIsoDate(date)
}

/** Monday of the ISO week containing `localDate`. */
export function mondayOf(localDate: string): string {
  const date = parseIsoDate(localDate)
  const weekday = date.getUTCDay() // 0 = Sunday
  const back = (weekday + 6) % 7
  return addDays(localDate, -back)
}

/** Normalise a DB `date` value (string or Date) to `YYYY-MM-DD`. */
export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return formatIsoDate(value)
  return value.slice(0, 10)
}

/**
 * Common IANA zones for the settings select (the detected zone is always
 * added on top when it is not in this list).
 */
export const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Zurich",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const
