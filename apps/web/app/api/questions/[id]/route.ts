import { jsonError, handleRouteError, respondTyped } from "@/lib/api/http";
import { QuestionDetailResponseSchema } from "@/lib/api/schemas";
import { getQuestion } from "@/lib/data/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/questions/[id] */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) return jsonError(400, "bad_request", "Missing question id");
    const detail = await getQuestion(id);
    if (!detail) return jsonError(404, "not_found", `Question not found: ${id}`);
    return respondTyped(QuestionDetailResponseSchema, detail);
  } catch (err) {
    return handleRouteError(err);
  }
}
