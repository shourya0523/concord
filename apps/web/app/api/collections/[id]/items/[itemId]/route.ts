import { handleRouteError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { CollectionListResponseSchema } from "@/lib/api/schemas";
import { removeCollectionItem } from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/collections/[id]/items/[itemId] — remove one item. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await getApiUser("edit collections");
    if (!user.ok) return user.response;
    const { id, itemId } = await ctx.params;
    return respondTyped(
      CollectionListResponseSchema,
      await removeCollectionItem({ userId: user.userId, collectionId: id, itemId }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
