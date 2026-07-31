import { handleRouteError, respondTyped } from "@/lib/api/http";
import { ConceptListResponseSchema } from "@/lib/api/schemas";
import { listConcepts } from "@/lib/data/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/concepts — concepts with diagram refs and resources. */
export async function GET() {
  try {
    return respondTyped(ConceptListResponseSchema, await listConcepts());
  } catch (err) {
    return handleRouteError(err);
  }
}
