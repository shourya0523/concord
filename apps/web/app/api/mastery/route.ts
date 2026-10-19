import { handleRouteError, respondTyped } from "@/lib/api/http";
import { MasteryListResponseSchema } from "@/lib/api/schemas";
import { getApiUser } from "@/lib/api/auth";
import { listMastery } from "@/lib/data/mastery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mastery — live app.mastery_records with stub fallback. */
export async function GET() {
  try {
    const user = await getApiUser("view mastery");
    if (!user.ok) return user.response;
    return respondTyped(MasteryListResponseSchema, await listMastery(user.userId));
  } catch (err) {
    return handleRouteError(err);
  }
}
