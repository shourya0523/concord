/**
 * Next.js 16 proxy — Neon Auth route protection when configured; passthrough otherwise.
 * Frontend owns /auth UI pages; this only gates protected paths.
 */
import { createAuthProxy, isNeonAuthConfigured } from "@/lib/auth/server";

const protect = createAuthProxy({ loginUrl: "/sign-in" });

export default protect;

export const config = {
  // Mode A prep pages (/prep/heat, /prep/rag) are public-read — heat/RAG APIs
  // are already anonymous. Auth still gates practice persistence + account.
  matcher: [
    "/practice/:path*",
    "/account/:path*",
    "/api/practice/:path*",
    "/api/notes/:path*",
    "/api/mastery/:path*",
    "/api/admin/:path*",
  ],
};

// Re-export for diagnostics / tests
export { isNeonAuthConfigured };
