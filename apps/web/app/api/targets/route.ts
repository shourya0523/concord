import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  TargetCompanySetResponseSchema,
  UpdateTargetCompanySetRequestSchema,
} from "@/lib/api/schemas";
import {
  getTargetCompanySet,
  putTargetCompanySet,
} from "@/lib/data/targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/targets — current user's target-company set. */
export async function GET() {
  try {
    const user = await getApiUser("view target companies");
    if (!user.ok) return user.response;
    const result = await getTargetCompanySet(user.userId);
    return respondTyped(TargetCompanySetResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}

/** PUT /api/targets — replace current user's selected targets. */
export async function PUT(request: Request) {
  try {
    const user = await getApiUser("update target companies");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(UpdateTargetCompanySetRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await putTargetCompanySet({
      userId: user.userId,
      email: user.email,
      input: parsed.data,
    });
    return respondTyped(TargetCompanySetResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
