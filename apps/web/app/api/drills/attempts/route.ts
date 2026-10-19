import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { DrillAttemptRequestSchema, DrillAttemptResponseSchema } from "@/lib/api/drill-schemas"
import { gradeDrill } from "@/lib/data/drills"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/drills/attempts — grade a numeric drill exactly and record it. */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("record drill attempts")
    if (!user.ok) return user.response
    const body = await request.json().catch(() => ({}))
    const parsed = parseOrError(DrillAttemptRequestSchema, body)
    if (!parsed.ok) return parsed.response
    const result = await gradeDrill({
      userId: user.userId,
      email: user.email,
      drillId: parsed.data.drill_id,
      responseText: parsed.data.response_text,
      timeSpentMs: parsed.data.time_spent_ms ?? null,
    })
    return respondTyped(DrillAttemptResponseSchema, result, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
