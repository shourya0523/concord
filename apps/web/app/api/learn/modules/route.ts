import { handleRouteError, respondTyped } from "@/lib/api/http";
import { LearningModuleListResponseSchema } from "@/lib/api/schemas";
import { listLearningModules } from "@/lib/data/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/modules — publishable MVP learning modules. */
export async function GET() {
  try {
    return respondTyped(
      LearningModuleListResponseSchema,
      await listLearningModules(),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
