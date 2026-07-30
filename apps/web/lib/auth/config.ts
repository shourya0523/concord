/** Neon Auth env gate (ADR 0006) — re-exports backend env helpers for UI shells. */
import { isNeonAuthConfigured, getNeonAuthConfig } from "./env"

export { isNeonAuthConfigured, getNeonAuthConfig }

export function neonAuthPublicStatus() {
  return {
    configured: isNeonAuthConfigured(),
    provider: "neon-auth" as const,
  }
}
