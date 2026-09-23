/**
 * Next.js 16 proxy — Neon Auth route protection when configured; passthrough otherwise.
 * Frontend owns /auth UI pages; this only gates protected paths.
 *
 * Admin (/admin, /api/admin): Neon Auth sign-in is required when configured;
 * the ADMIN_EMAILS allow-list is enforced by the admin page and route handlers
 * (lib/admin/session.ts), which can read the session email. Without Neon Auth
 * the admin surface is dev-only and returns 503 in production.
 */
import { NextResponse, type NextRequest } from "next/server";

import { adminProxyBlocked, isAdminPath } from "@/lib/admin/access";
import { createAuthProxy, isNeonAuthConfigured } from "@/lib/auth/server";

const protect = createAuthProxy({ loginUrl: "/sign-in" });

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAdminPath(pathname) && adminProxyBlocked(isNeonAuthConfigured(), process.env.NODE_ENV)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: {
            code: "auth_not_configured",
            message: "Admin requires Neon Auth in production",
          },
        },
        { status: 503 },
      );
    }
    return new NextResponse("Admin is unavailable: Neon Auth is not configured.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return protect(request);
}

export const config = {
  // Mode A prep pages (/prep/heat, /prep/rag) are public-read — heat/RAG APIs
  // are already anonymous. Auth still gates practice persistence + account.
  matcher: [
    "/practice/:path*",
    "/account/:path*",
    "/api/practice/:path*",
    "/api/transcribe",
    "/api/notes/:path*",
    "/api/mastery/:path*",
    "/api/drills/:path*",
    "/api/admin/:path*",
    "/admin/:path*",
  ],
};

// Re-export for diagnostics / tests
export { isNeonAuthConfigured };
