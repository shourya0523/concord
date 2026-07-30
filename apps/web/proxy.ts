/**
 * Next.js 16 proxy — Neon Auth route protection when configured; passthrough otherwise.
 * Frontend owns /auth UI pages; this only gates protected paths.
 */
import { createAuthProxy, isNeonAuthConfigured } from "@/lib/auth/server";

const protect = createAuthProxy({ loginUrl: "/auth/sign-in" });

export default protect;

export const config = {
  matcher: [
    "/practice/:path*",
    "/prep/:path*",
    "/account/:path*",
    "/api/practice/:path*",
    "/api/notes/:path*",
    "/api/mastery/:path*",
    "/api/admin/:path*",
  ],
};

// Re-export for diagnostics / tests
export { isNeonAuthConfigured };
