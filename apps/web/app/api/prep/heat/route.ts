import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { MultiFirmHeatResponseSchema } from "@/lib/api/schemas";
import { getMultiFirmHeat } from "@/lib/data/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/prep/heat?firm_id=a&firm_id=b — aggregate heat for firm set. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const firmIds = url.searchParams.getAll("firm_id").filter(Boolean);
    if (firmIds.length === 0) {
      return jsonError(400, "bad_request", "Supply at least one firm_id");
    }
    return respondTyped(
      MultiFirmHeatResponseSchema,
      await getMultiFirmHeat(firmIds),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
