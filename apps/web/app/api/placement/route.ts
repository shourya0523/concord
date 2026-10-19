import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import {
  PlacementActionRequestSchema,
  PlacementActionResponseSchema,
  PlacementResponseSchema,
} from "@/lib/api/retention-schemas"
import { completePlacement, getPlacementQuestions } from "@/lib/data/placement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/placement — 10 placement questions across core concepts. */
export async function GET() {
  try {
    const user = await getApiUser("start the placement check")
    if (!user.ok) return user.response
    return respondTyped(PlacementResponseSchema, await getPlacementQuestions(user.userId))
  } catch (err) {
    return handleRouteError(err)
  }
}

/**
 * POST /api/placement {action: "complete" | "skip"} — records
 * placement_completed_at on the profile. Answers themselves go through the
 * attempts API (review queue + mastery seeding).
 */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("finish the placement check")
    if (!user.ok) return user.response
    const body = await request.json().catch(() => ({}))
    const parsed = parseOrError(PlacementActionRequestSchema, body)
    if (!parsed.ok) return parsed.response
    const completedAt = await completePlacement({ userId: user.userId, email: user.email })
    return respondTyped(PlacementActionResponseSchema, {
      completed_at: completedAt,
      skipped: parsed.data.action === "skip",
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
