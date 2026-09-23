import { handleRouteError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { BookmarkListResponseSchema } from "@/lib/api/schemas";
import { deleteBookmark } from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/bookmarks/[id] — un-bookmark; returns the remaining list. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("remove bookmarks");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    return respondTyped(
      BookmarkListResponseSchema,
      await deleteBookmark(user.userId, id),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
