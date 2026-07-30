import { handleRouteError, respondTyped } from "@/lib/api/http";
import { HealthResponseSchema } from "@/lib/api/schemas";
import { isNeonAuthConfigured } from "@/lib/auth/server";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — probe auth/db configuration (no secrets leaked). */
export async function GET() {
  try {
    return respondTyped(HealthResponseSchema, {
      ok: true,
      service: "ibpe-web",
      auth: isNeonAuthConfigured() ? "configured" : "stub",
      database: isDatabaseConfigured() ? "configured" : "unavailable",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
