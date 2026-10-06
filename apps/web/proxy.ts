/**
 * Next.js 16 proxy — the login gate (lib/auth/gate*.ts, DESIGN.md §17).
 *
 * Every page and API needs a Neon Auth session except the landing page, the
 * auth flow, /api/health, /api/cron/* (CRON_SECRET) and email unsubscribe
 * links. Signed-out page visits redirect to /sign-in?next=…; signed-out API
 * calls get a JSON 401. Without Neon Auth (local dev / e2e stub mode) the
 * gate is a passthrough and the app runs as `dev_stub_user`.
 *
 * Admin (/admin, /api/admin): Neon Auth sign-in is required when configured;
 * the ADMIN_EMAILS allow-list is enforced by the admin page and route handlers
 * (lib/admin/session.ts), which can read the session email. Without Neon Auth
 * the admin surface is dev-only and returns 503 in production.
 */
import { NextResponse, type NextRequest } from "next/server";

import { adminProxyBlocked, isAdminPath } from "@/lib/admin/access";
import { gateRequest } from "@/lib/auth/gate-proxy";
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
  return gateRequest(request, protect);
}

export const config = {
  // Everything except Next's build output and files with an extension
  // (public assets); lib/auth/gate.ts decides what stays public.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};

// Re-export for diagnostics / tests
export { isNeonAuthConfigured };
