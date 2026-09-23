/**
 * Resolve where to send a user after Neon Auth sign-in / sign-up.
 * New accounts (no prep profile) go to onboarding; returning users go home.
 *
 * Home is Today (plan 2026-09-23-001 P4.4). The /today page itself redirects
 * to /dashboard when the `daily_set` flag is off, so client code can always
 * target POST_AUTH_HOME without reading server flags.
 */

export const TODAY_PATH = "/today"
export const DASHBOARD_PATH = "/dashboard"
/** Post-login landing for returning users. */
export const POST_AUTH_HOME = TODAY_PATH

/** Home route for a flag state (server components / redirects). */
export function homePathFor(dailySetEnabled: boolean): string {
  return dailySetEnabled ? TODAY_PATH : DASHBOARD_PATH
}

export type PrepProfileProbe = {
  profile?: {
    modes?: string[] | null
    track?: string | null
    role?: string | null
    interview_date?: string | null
    availability_minutes?: number | null
    focus_prompt?: string | null
    updated_at?: string | null
  } | null
  source?: string
}

export function hasPrepProfile(payload: PrepProfileProbe | null | undefined): boolean {
  const profile = payload?.profile
  if (!profile) return false
  if (profile.updated_at) return true
  if (Array.isArray(profile.modes) && profile.modes.length > 0) return true
  if (profile.track || profile.role || profile.interview_date) return true
  if (profile.availability_minutes != null) return true
  if (profile.focus_prompt) return true
  return false
}

/** Pure decision: onboarding for new users, home for returning ones. */
export function postAuthPathFor(
  payload: PrepProfileProbe | null | undefined,
  home: string = POST_AUTH_HOME,
): string {
  return hasPrepProfile(payload) ? home : "/onboarding"
}

/** Client helper — probes /api/profile with session cookies. */
export async function resolvePostAuthPath(
  preferOnboarding: boolean,
): Promise<string> {
  if (preferOnboarding) return "/onboarding"
  try {
    const response = await fetch("/api/profile", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
    if (!response.ok) return "/onboarding"
    const payload = (await response.json()) as PrepProfileProbe
    return postAuthPathFor(payload)
  } catch {
    return "/onboarding"
  }
}
