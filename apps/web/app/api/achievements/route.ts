import { handleRouteError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { AchievementsResponseSchema } from "@/lib/api/retention-schemas"
import { getAchievementShelf } from "@/lib/data/achievement-shelf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/achievements — the tombstone shelf: earned milestones (newest
 * first) and locked ones with the distance left. Evaluates every milestone
 * on read, so readiness / concept tombstones land without visiting Today.
 */
export async function GET() {
  try {
    const user = await getApiUser("view achievements")
    if (!user.ok) return user.response
    const shelf = await getAchievementShelf({ userId: user.userId, email: user.email })
    return respondTyped(AchievementsResponseSchema, shelf)
  } catch (err) {
    return handleRouteError(err)
  }
}
