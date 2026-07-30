import { handleRouteError, respondTyped } from "@/lib/api/http";
import { FirmHeatResponseSchema } from "@/lib/api/schemas";
import { getFirmTopicHeat } from "@/lib/data/firms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/firms/[firmId]/heat — Mode A topic intensity stub/live. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ firmId: string }> },
) {
  try {
    const { firmId } = await ctx.params;
    const heat = await getFirmTopicHeat(firmId);
    return respondTyped(FirmHeatResponseSchema, heat);
  } catch (err) {
    return handleRouteError(err);
  }
}
