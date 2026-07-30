import { auth, isNeonAuthConfigured } from "@/lib/auth/server";
import { jsonError } from "@/lib/api/http";

/**
 * Neon Auth API proxy (Managed Better Auth).
 * When env is missing, return 503 so the app still builds / frontend can develop.
 */
const handlers = auth?.handler();

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!isNeonAuthConfigured() || !handlers) {
    return jsonError(
      503,
      "auth_not_configured",
      "Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (≥32 chars) to enable Neon Auth",
    );
  }
  return handlers.GET(request, ctx);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  if (!isNeonAuthConfigured() || !handlers) {
    return jsonError(
      503,
      "auth_not_configured",
      "Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (≥32 chars) to enable Neon Auth",
    );
  }
  return handlers.POST(request, ctx);
}
