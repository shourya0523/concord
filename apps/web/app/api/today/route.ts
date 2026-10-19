import { handleRouteError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { TodayResponseSchema } from "@/lib/api/retention-schemas"
import { getToday } from "@/lib/data/today"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/today[?firm_id=a&firm_id=b] — Today home payload: countdown,
 * streak, XP, daily-set progress, readiness per firm (stored targets unless
 * firm_id is supplied) and Warren's mood.
 */
export async function GET(request: Request) {
  try {
    const user = await getApiUser("view today")
    if (!user.ok) return user.response
    const firmIds = new URL(request.url).searchParams.getAll("firm_id").filter(Boolean)
    return respondTyped(
      TodayResponseSchema,
      await getToday({ userId: user.userId, email: user.email, firmIds }),
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
