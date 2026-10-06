/**
 * Login gate policy (DESIGN.md §17): the landing page and the auth flow are
 * public; every other page and API needs a Neon Auth session. Pure — no
 * Next.js or auth imports — so proxy.ts, the sign-in pages and tests share it.
 */

export const SIGN_IN_PATH = "/sign-in"
export const SIGN_UP_PATH = "/sign-up"

/** Exact public pages. */
const PUBLIC_EXACT = new Set(["/", SIGN_IN_PATH, SIGN_UP_PATH, "/api/health", "/api/notifications/unsubscribe"])

/**
 * Public prefixes: Neon Auth's handler and callbacks, and the cron endpoint
 * (it authenticates with CRON_SECRET, not a session).
 */
const PUBLIC_PREFIXES = [`${SIGN_IN_PATH}/`, `${SIGN_UP_PATH}/`, "/api/auth/", "/auth/", "/api/cron/"]

/** Static files served from /public or by Next (never gated). */
const STATIC_FILE = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|txt|xml|webmanifest|json|js|css|map|woff2?)$/i

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  if (pathname.startsWith("/_next/")) return true
  return !isApiPath(pathname) && STATIC_FILE.test(pathname)
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

/**
 * A `next` value that is safe to redirect to after sign-in: a same-site path
 * ("/today?x=1"), never another origin ("//evil.com", "/\\evil.com",
 * "https://…"), never an API route and never the auth pages themselves.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null
  if ([...value].some((ch) => ch.charCodeAt(0) < 0x20)) return null
  let url: URL
  try {
    url = new URL(value, "https://concord.invalid")
  } catch {
    return null
  }
  if (url.origin !== "https://concord.invalid") return null
  const { pathname } = url
  if (isApiPath(pathname) || pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH) return null
  if (pathname.startsWith("/auth/")) return null
  return `${pathname}${url.search}${url.hash}`
}

/** Where to send a signed-out visitor: the sign-in page, remembering the way back. */
export function signInRedirectPath(pathname: string, search = ""): string {
  const next = safeNextPath(`${pathname}${search}`)
  return next && next !== "/" ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH
}

/** Keep `next` when moving between sign-in and sign-up. */
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}

/** True when an auth middleware response is its "go sign in" redirect. */
export function isLoginRedirect(status: number, location: string | null, requestUrl: string): boolean {
  if (status < 300 || status >= 400 || !location) return false
  try {
    const target = new URL(location, requestUrl)
    return target.origin === new URL(requestUrl).origin && target.pathname === SIGN_IN_PATH
  } catch {
    return false
  }
}
