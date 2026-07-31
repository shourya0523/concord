import { handleRouteError, respondTyped } from "@/lib/api/http";
import {
  CompanySignalsResponseSchema,
  getCompanySignals,
} from "@/lib/data/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ firmId: string }> };

/** GET /api/firms/[firmId]/signals?topic=&limit=&offset= — occurrence browser. */
export async function GET(request: Request, { params }: Props) {
  try {
    const { firmId } = await params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const offsetRaw = Number(url.searchParams.get("offset") ?? "0");
    return respondTyped(
      CompanySignalsResponseSchema,
      await getCompanySignals({
        firmId,
        topic: url.searchParams.get("topic"),
        limit: Number.isFinite(limitRaw)
          ? Math.min(50, Math.max(1, Math.trunc(limitRaw)))
          : 20,
        offset: Number.isFinite(offsetRaw)
          ? Math.max(0, Math.trunc(offsetRaw))
          : 0,
      }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
