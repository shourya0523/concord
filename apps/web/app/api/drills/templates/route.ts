import { handleRouteError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { DrillTemplatesResponseSchema } from "@/lib/api/drill-schemas"
import { listDrillTemplateSummaries } from "@/lib/data/drills"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/drills/templates — drill catalogue with this user's attempts per template. */
export async function GET() {
  try {
    const user = await getApiUser("view numeric drills")
    if (!user.ok) return user.response
    return respondTyped(DrillTemplatesResponseSchema, await listDrillTemplateSummaries(user.userId))
  } catch (err) {
    return handleRouteError(err)
  }
}
