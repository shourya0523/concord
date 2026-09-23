import { z } from "zod";
import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { CollectionListResponseSchema } from "@/lib/api/schemas";
import { addCollectionItem } from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddCollectionItemRequestSchema = z.object({
  // app.collection_items stores exactly one of these three references.
  entity_kind: z.enum(["question", "concept", "module"]),
  entity_id: z.string().min(1),
});

/** POST /api/collections/[id]/items — add a question/concept/module. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("edit collections");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(AddCollectionItemRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await addCollectionItem({
      userId: user.userId,
      collectionId: id,
      entityKind: parsed.data.entity_kind,
      entityId: parsed.data.entity_id,
    });
    return respondTyped(CollectionListResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
