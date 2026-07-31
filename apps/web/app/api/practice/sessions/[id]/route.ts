import { jsonError, handleRouteError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { PracticeSessionResponseSchema } from "@/lib/api/schemas";
import { getPracticeSession } from "@/lib/data/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/practice/sessions/[id] */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("view practice sessions");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    const session = await getPracticeSession(id, user.userId);
    if (!session) return jsonError(404, "not_found", `Session not found: ${id}`);
    return respondTyped(PracticeSessionResponseSchema, {
      session,
      source: session.metadata?.stub === true ? "stub" : "published",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
