import { handleRouteError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { AchievementsResponseSchema } from "@/lib/api/retention-schemas"
import { achievementCatalogue } from "@/lib/achievements"
import { listAchievements } from "@/lib/data/activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/achievements — earned milestones (newest first) + locked static ones. */
export async function GET() {
  try {
    const user = await getApiUser("view achievements")
    if (!user.ok) return user.response
    const { items, source } = await listAchievements(user.userId)
    const earnedIds = new Set(items.map((item) => item.id))
    return respondTyped(AchievementsResponseSchema, {
      earned: items,
      locked: achievementCatalogue().filter((item) => !earnedIds.has(item.id)),
      source,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
