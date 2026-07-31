import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { LearningModuleDetailResponseSchema } from "@/lib/api/schemas";
import { getLearningModule } from "@/lib/data/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/modules/[slug] — module and ordered checkpoints. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const result = await getLearningModule(slug);
    if (!result) return jsonError(404, "not_found", `Module not found: ${slug}`);
    return respondTyped(LearningModuleDetailResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
