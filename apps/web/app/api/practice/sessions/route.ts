import {
  handleRouteError,
  jsonError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import {
  CreatePracticeSessionRequestSchema,
  PracticeSessionResponseSchema,
} from "@/lib/api/schemas";
import { getSession, isNeonAuthConfigured } from "@/lib/auth/server";
import { createPracticeSession } from "@/lib/data/practice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/practice/sessions — create a practice session (stub-friendly).
 * Uses Neon Auth user when available; otherwise a stable dev stub user.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(CreatePracticeSessionRequestSchema, body);
    if (!parsed.ok) return parsed.response;

    const session = await getSession();
    let userId = session.data?.user?.id;
    if (!userId) {
      if (isNeonAuthConfigured()) {
        return jsonError(401, "unauthorized", "Sign in to start a practice session");
      }
      userId = "dev_stub_user";
    }

    const result = await createPracticeSession({
      userId,
      input: parsed.data,
    });
    return respondTyped(PracticeSessionResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
