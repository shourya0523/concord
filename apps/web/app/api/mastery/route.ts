import { MasterySchema } from "@ibpe/contracts";
import { handleRouteError, respondTyped } from "@/lib/api/http";
import { MasteryListResponseSchema } from "@/lib/api/schemas";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mastery — stub empty list until attempts accumulate. */
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

    // Placeholder: real mastery reads go through RLS + app.mastery_records
    const items = MasterySchema.array().parse([]);
    return respondTyped(MasteryListResponseSchema, {
      items,
      source: "stub",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
