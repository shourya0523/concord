import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  BookmarkListResponseSchema,
  CreateBookmarkRequestSchema,
} from "@/lib/api/schemas";
import { createBookmark, listBookmarks } from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bookmarks — current user's bookmarks. */
export async function GET() {
  try {
    const user = await getApiUser("view bookmarks");
    if (!user.ok) return user.response;
    return respondTyped(
      BookmarkListResponseSchema,
      await listBookmarks(user.userId),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/bookmarks — create a bookmark. */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("create bookmarks");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(CreateBookmarkRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await createBookmark({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(BookmarkListResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
