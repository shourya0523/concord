import { handleRouteError, respondTyped } from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import { ProgressResponseSchema, getUserProgress } from "@/lib/data/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/progress — activity, streak, accuracy, module progress, sessions. */
export async function GET() {
  try {
    const user = await getApiUser("view progress");
    if (!user.ok) return user.response;
    return respondTyped(ProgressResponseSchema, await getUserProgress(user.userId));
  } catch (err) {
    return handleRouteError(err);
  }
}
