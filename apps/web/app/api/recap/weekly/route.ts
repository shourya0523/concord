import { getApiUser } from "@/lib/api/auth"
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http"
import { getWeeklyRecap } from "@/lib/data/weekly-recap"
import { isFlagOn } from "@/lib/flags"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/recap/weekly — this week so far vs last week (XP, goal days,
 * graded cards, drills, mocks) plus milestones closed this week. The in-app
 * twin of the Sunday email recap.
 */
export async function GET() {
  try {
    if (!isFlagOn("gamification")) {
      return jsonError(404, "feature_disabled", "Gamification is turned off")
    }
    const user = await getApiUser("view your weekly recap")
    if (!user.ok) return user.response
    return jsonOk(await getWeeklyRecap({ userId: user.userId }))
  } catch (err) {
    return handleRouteError(err)
  }
}
