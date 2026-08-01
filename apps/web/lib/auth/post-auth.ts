/**
 * Resolve where to send a user after Neon Auth sign-in / sign-up.
 * New accounts (no prep profile) go to onboarding; returning users to dashboard.
 */

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
    return hasPrepProfile(payload) ? "/dashboard" : "/onboarding"
  } catch {
    return "/onboarding"
  }
}
