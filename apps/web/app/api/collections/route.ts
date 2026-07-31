import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  CollectionListResponseSchema,
  CreateCollectionRequestSchema,
} from "@/lib/api/schemas";
import {
  createCollection,
  listCollections,
} from "@/lib/data/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/collections — current user's collections. */
export async function GET() {
  try {
    const user = await getApiUser("view collections");
    if (!user.ok) return user.response;
    return respondTyped(
      CollectionListResponseSchema,
      await listCollections(user.userId),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** POST /api/collections — create a collection container (+ stub items). */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("create collections");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(CreateCollectionRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await createCollection({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(CollectionListResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
