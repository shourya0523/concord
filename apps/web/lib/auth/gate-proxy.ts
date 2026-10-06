/**
 * The login gate as a proxy step (used by apps/web/proxy.ts).
 *
 * - Public paths (lib/auth/gate.ts) pass straight through.
 * - Everything else goes through the auth middleware (`protect`). When it
 *   answers with its "go sign in" redirect we rewrite it: pages go to
 *   /sign-in?next=<where they were>, APIs get a JSON 401 instead of an HTML
 *   redirect `fetch()` can't use. Set-Cookie headers (stale session cleanup)
 *   are kept either way.
 * - Without Neon Auth (local dev, e2e stub mode) `protect` is a passthrough
 *   and the app runs as `dev_stub_user`, same as the API layer.
 */
import { NextResponse, type NextRequest } from "next/server"

import { isApiPath, isLoginRedirect, isPublicPath, signInRedirectPath } from "./gate"

export type Protect = (request: NextRequest) => Response | Promise<Response>

function copyCookies(from: Response, to: NextResponse): NextResponse {
  for (const cookie of from.headers.getSetCookie()) to.headers.append("Set-Cookie", cookie)
  return to
}

export async function gateRequest(request: NextRequest, protect: Protect): Promise<Response> {
  const { pathname, search } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const response = await protect(request)
  if (!isLoginRedirect(response.status, response.headers.get("location"), request.url)) return response

  if (isApiPath(pathname)) {
    return copyCookies(
      response,
      NextResponse.json({ error: { code: "unauthorized", message: "Sign in to continue" } }, { status: 401 }),
    )
  }
  return copyCookies(response, NextResponse.redirect(new URL(signInRedirectPath(pathname, search), request.url)))
}
