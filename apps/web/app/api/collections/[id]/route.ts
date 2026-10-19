import { handleRouteError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { CollectionListResponseSchema } from "@/lib/api/schemas";
import { deleteCollection } from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/collections/[id] — delete a collection and its items. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("delete collections");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    return respondTyped(
      CollectionListResponseSchema,
      await deleteCollection(user.userId, id),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
