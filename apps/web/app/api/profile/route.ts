import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  PrepProfilePatchSchema,
  PrepProfileResponseSchema,
  getPrepProfile,
  putPrepProfile,
} from "@/lib/data/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/profile — current user's prep profile (onboarding answers). */
export async function GET() {
  try {
    const user = await getApiUser("view prep profile");
    if (!user.ok) return user.response;
    return respondTyped(PrepProfileResponseSchema, await getPrepProfile(user.userId));
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * PUT /api/profile — save prep profile. Partial: omitted fields keep their
 * stored value (new preference fields are never wiped by an older client).
 */
export async function PUT(request: Request) {
  try {
    const user = await getApiUser("update prep profile");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(PrepProfilePatchSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await putPrepProfile({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(PrepProfileResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
