import { createNeonAuth } from "@neondatabase/auth/next/server"

import { isNeonAuthConfigured } from "./config"

export type NeonAuth = ReturnType<typeof createNeonAuth>

let cached: NeonAuth | null | undefined

/**
 * Lazy Neon Auth instance. Returns null when env is unset so `next build`
 * and local UI shells work without live Neon credentials.
 */
export function getAuth(): NeonAuth | null {
  if (cached !== undefined) return cached
  if (!isNeonAuthConfigured()) {
    cached = null
    return cached
  }
  cached = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    },
  })
  return cached
}
