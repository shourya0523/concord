/** Neon Auth env gate (ADR 0006). Coordinate live wiring with ibpe-backend. */
export function isNeonAuthConfigured(): boolean {
  const base = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET
  return Boolean(base && secret && secret.length >= 32)
}

export function neonAuthPublicStatus() {
  return {
    configured: isNeonAuthConfigured(),
    provider: "neon-auth" as const,
  }
}
