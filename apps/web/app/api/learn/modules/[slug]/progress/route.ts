import { z } from "zod";
import { handleRouteError, jsonError, jsonOk, parseOrError } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { getLearningModule } from "@/lib/data/learning";
import { setModuleCheckpoint } from "@/lib/data/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateCheckpointRequestSchema = z.object({
  checkpoint_id: z.string().min(1),
  complete: z.boolean().default(true),
});

/** PUT /api/learn/modules/[slug]/progress — mark a roadmap checkpoint done / not done. */
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getApiUser("track module progress");
    if (!user.ok) return user.response;
    const { slug } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(UpdateCheckpointRequestSchema, body);
    if (!parsed.ok) return parsed.response;

    const learningModule = await getLearningModule(slug);
    if (!learningModule) return jsonError(404, "not_found", `Module not found: ${slug}`);
    const checkpointIds = [...learningModule.checkpoints]
      .sort((a, b) => a.position - b.position)
      .map((checkpoint) => checkpoint.id);
    if (!checkpointIds.includes(parsed.data.checkpoint_id)) {
      return jsonError(
        400,
        "validation_error",
        `Checkpoint ${parsed.data.checkpoint_id} is not part of ${slug}`,
      );
    }

    const result = await setModuleCheckpoint({
      userId: user.userId,
      email: user.email,
      moduleId: learningModule.module.id,
      checkpointIds,
      checkpointId: parsed.data.checkpoint_id,
      complete: parsed.data.complete,
    });
    return jsonOk({ module_progress: result.entry, source: result.source });
  } catch (err) {
    return handleRouteError(err);
  }
}
