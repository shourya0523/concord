import { handleRouteError, respondTyped } from "@/lib/api/http";
import { FirmCatalogResponseSchema } from "@/lib/data/catalog";
import { listFirmCatalog } from "@/lib/data/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/firms — canonical firm catalog with occurrence volumes. */
export async function GET() {
  try {
    return respondTyped(FirmCatalogResponseSchema, await listFirmCatalog());
  } catch (err) {
    return handleRouteError(err);
  }
}
