import { jsonError } from "@/lib/api/http";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin stub — Wave 2 placeholder. Real admin APIs land after roles exist.
 * Always requires Neon Auth when configured; returns 501 otherwise.
 */
export async function GET() {
  if (!isNeonAuthConfigured()) {
    return jsonError(
      503,
      "auth_not_configured",
      "Admin APIs require Neon Auth configuration",
    );
  }
  const session = await getSession();
  if (!session.data?.user?.id) {
    return jsonError(401, "unauthorized", "Sign in required");
  }
  return jsonError(
    501,
    "not_implemented",
    "Admin APIs are stubbed for Wave 2 — ingestion uses packages/database seed:bank",
  );
}
