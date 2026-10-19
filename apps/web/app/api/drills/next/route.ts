import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import { DrillNextQuerySchema, DrillNextResponseSchema } from "@/lib/api/drill-schemas"
import { nextDrill } from "@/lib/data/drills"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/drills/next?template=&concept=&difficulty= — a freshly seeded
 * numeric drill (weak concepts preferred when no template is named).
 */
export async function GET(request: Request) {
  try {
    const user = await getApiUser("practise numeric drills")
    if (!user.ok) return user.response
    const params = new URL(request.url).searchParams
    const parsed = parseOrError(DrillNextQuerySchema, {
      template: params.get("template") || undefined,
      concept: params.get("concept") || undefined,
      difficulty: params.get("difficulty") || undefined,
    })
    if (!parsed.ok) return parsed.response
    const result = await nextDrill({
      userId: user.userId,
      templateId: parsed.data.template,
      conceptId: parsed.data.concept,
      difficulty: parsed.data.difficulty,
    })
    return respondTyped(DrillNextResponseSchema, result)
  } catch (err) {
    return handleRouteError(err)
  }
}
