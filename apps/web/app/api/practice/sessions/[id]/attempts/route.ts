import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  AttemptResponseSchema,
  CreateAttemptRequestSchema,
} from "@/lib/api/schemas";
import { recordPracticeAttempt } from "@/lib/data/attempts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/practice/sessions/[id]/attempts — record a practice attempt. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("record practice attempts");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(CreateAttemptRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await recordPracticeAttempt({
      userId: user.userId,
      email: user.email,
      sessionId: id,
      input: parsed.data,
    });
    return respondTyped(AttemptResponseSchema, result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
