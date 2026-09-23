import { handleRouteError, jsonOk } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { listDueReviews } from "@/lib/data/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/review/due?limit= — questions due for spaced review, oldest first. */
export async function GET(request: Request) {
  try {
    const user = await getApiUser("view your review queue");
    if (!user.ok) return user.response;
    const raw = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.trunc(raw))) : 20;
    return jsonOk(await listDueReviews(user.userId, { limit }));
  } catch (err) {
    return handleRouteError(err);
  }
}
