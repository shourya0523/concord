/**
 * Browser-safe helpers for notification settings (no server imports).
 */
import { COMMON_TIMEZONES, isValidTimeZone } from "./time"

/** VAPID public key (base64url) → Uint8Array for pushManager.subscribe. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** 0–23 → "7:00 am" / "12:00 pm". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? "am" : "pm"
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:00 ${suffix}`
}

/** Browser's IANA zone, or null when unavailable/invalid. */
export function detectTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? zone : null
  } catch {
    return null
  }
}

/** Select options: common zones plus the detected and saved ones, deduped. */
export function timeZoneOptions(...extra: Array<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const zone of extra) if (zone && isValidTimeZone(zone)) set.add(zone)
  for (const zone of COMMON_TIMEZONES) set.add(zone)
  return [...set]
}

/** "America/New_York" → "New York (America)". */
export function timeZoneLabel(zone: string): string {
  if (zone === "UTC") return "UTC"
  const parts = zone.split("/")
  const city = (parts[parts.length - 1] ?? zone).replace(/_/g, " ")
  return parts.length > 1 ? `${city} (${parts[0]})` : city
}

/** Local hour (0–23) in `timeZone` when it is `utcHour`:00 UTC on `now`'s UTC date. */
export function localHourOfUtc(utcHour: number, timeZone: string, now: Date = new Date()): number {
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour))
  try {
    const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
      .formatToParts(at)
      .find((part) => part.type === "hour")?.value
    return hour === undefined ? utcHour : Number(hour) % 24
  } catch {
    return utcHour
  }
}
