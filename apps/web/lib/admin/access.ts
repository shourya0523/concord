/**
 * Admin access policy (plan P2.5). Pure — no Next.js or auth imports so it is
 * unit-testable and usable from proxy.ts, route handlers and pages.
 *
 * - Neon Auth configured: the session email must be in ADMIN_EMAILS
 *   (comma-separated, case-insensitive). No session → 401, not listed → 403.
 * - Neon Auth not configured: open only when NODE_ENV !== "production"
 *   (local dev review); in production the admin surface is unavailable (503).
 */

export type AdminAccessInput = {
  authConfigured: boolean
  nodeEnv: string | undefined
  email: string | null | undefined
  adminEmails: string | null | undefined
}

export type AdminAccess =
  | { allowed: true; mode: "allow_list" | "dev_open"; email: string | null }
  | { allowed: false; status: 401 | 403 | 503; code: string; message: string }

export function parseAdminEmails(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[,\s;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes("@")),
  )
}

export function decideAdminAccess(input: AdminAccessInput): AdminAccess {
  if (!input.authConfigured) {
    if (input.nodeEnv !== "production") {
      return { allowed: true, mode: "dev_open", email: input.email ?? null }
    }
    return {
      allowed: false,
      status: 503,
      code: "auth_not_configured",
      message: "Admin requires Neon Auth in production",
    }
  }
  const email = input.email?.trim().toLowerCase()
  if (!email) {
    return { allowed: false, status: 401, code: "unauthorized", message: "Sign in required" }
  }
  if (!parseAdminEmails(input.adminEmails).has(email)) {
    return {
      allowed: false,
      status: 403,
      code: "forbidden",
      message: "This account is not on the ADMIN_EMAILS allow-list",
    }
  }
  return { allowed: true, mode: "allow_list", email }
}

/** Paths the proxy treats as admin-only. */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  )
}

/**
 * Proxy-level gate (before any session lookup): block the admin surface in
 * production when Neon Auth is missing. Email checks happen in the page and
 * route handlers, which can read the session.
 */
export function adminProxyBlocked(authConfigured: boolean, nodeEnv: string | undefined): boolean {
  return !authConfigured && nodeEnv === "production"
}
