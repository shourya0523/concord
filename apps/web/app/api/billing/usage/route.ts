import { getApiUser } from "@/lib/api/auth"
import { handleRouteError, respondTyped } from "@/lib/api/http"
import { usageSummary } from "@/lib/billing/meter"
import { UsageSummarySchema } from "@/lib/billing/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/billing/usage — plan, today's free AI usage against the daily
 * limits, credit balance, and whether an organisation OpenRouter key is set (last
 * four characters only; the key itself never leaves the server).
 */
export async function GET() {
  try {
    const user = await getApiUser("view usage")
    if (!user.ok) return user.response
    return respondTyped(UsageSummarySchema, await usageSummary(user.userId))
  } catch (err) {
    return handleRouteError(err)
  }
}
