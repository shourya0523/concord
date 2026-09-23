/**
 * Server-side admin guard: resolves the Neon Auth session and applies the
 * ADMIN_EMAILS policy from ./access.
 */
import { jsonError } from "@/lib/api/http"
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server"

import { decideAdminAccess, type AdminAccess } from "./access"

export async function resolveAdminAccess(): Promise<AdminAccess> {
  const authConfigured = isNeonAuthConfigured()
  const session = authConfigured ? await getSession() : null
  return decideAdminAccess({
    authConfigured,
    nodeEnv: process.env.NODE_ENV,
    email: session?.data?.user?.email ?? null,
    adminEmails: process.env.ADMIN_EMAILS,
  })
}

/** Route-handler helper: the reviewer identity, or an error response. */
export async function requireAdminForApi(): Promise<
  { ok: true; reviewer: string } | { ok: false; response: Response }
> {
  const access = await resolveAdminAccess()
  if (!access.allowed) {
    return { ok: false, response: jsonError(access.status, access.code, access.message) }
  }
  return { ok: true, reviewer: access.email ?? "dev-local" }
}
