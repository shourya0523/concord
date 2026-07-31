import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  StudyPlanResponseSchema,
  UpdateStudyPlanRequestSchema,
} from "@/lib/api/schemas";
import { getStudyPlan, putStudyPlan } from "@/lib/data/study-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/study-plan — current user's study plan. */
export async function GET() {
  try {
    const user = await getApiUser("view study plan");
    if (!user.ok) return user.response;
    return respondTyped(StudyPlanResponseSchema, await getStudyPlan(user.userId));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** PUT /api/study-plan — replace current user's study plan. */
export async function PUT(request: Request) {
  try {
    const user = await getApiUser("update study plan");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(UpdateStudyPlanRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await putStudyPlan({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(StudyPlanResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
