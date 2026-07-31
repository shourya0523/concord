import { jsonError, handleRouteError, respondTyped } from "@/lib/api/http";
import { QuestionDetailResponseSchema } from "@/lib/api/schemas";
import { getQuestion } from "@/lib/data/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/questions/[id] */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (!id) return jsonError(400, "bad_request", "Missing question id");
    const url = new URL(request.url);
    const detail = await getQuestion(id, {
      includeStudy: url.searchParams.get("view") === "study",
    });
    if (!detail) return jsonError(404, "not_found", `Question not found: ${id}`);
    return respondTyped(QuestionDetailResponseSchema, detail);
  } catch (err) {
    return handleRouteError(err);
  }
}
