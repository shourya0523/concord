import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { ConceptDetailResponseSchema } from "@/lib/api/schemas";
import { getConceptDetail } from "@/lib/data/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/concepts/[slug] — concept detail with assets. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;
    const result = await getConceptDetail(slug);
    if (!result) return jsonError(404, "not_found", `Concept not found: ${slug}`);
    return respondTyped(ConceptDetailResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
