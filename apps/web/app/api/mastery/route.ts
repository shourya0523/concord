import { handleRouteError, respondTyped } from "@/lib/api/http";
import { MasteryListResponseSchema } from "@/lib/api/schemas";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";
import { jsonError } from "@/lib/api/http";
import { listMastery } from "@/lib/data/mastery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mastery — live app.mastery_records with stub fallback. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session.data?.user?.id) {
      if (isNeonAuthConfigured()) {
        return jsonError(401, "unauthorized", "Sign in to view mastery");
      }
      return respondTyped(MasteryListResponseSchema, {
        items: [],
        source: "stub",
      });
    }

    return respondTyped(MasteryListResponseSchema, await listMastery(session.data.user.id));
  } catch (err) {
    return handleRouteError(err);
  }
}
