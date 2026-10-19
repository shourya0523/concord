import { handleRouteError, jsonOk, parseOrError } from "@/lib/api/http"
import { requireAdminForApi } from "@/lib/admin/session"
import { setAccountPlan } from "@/lib/billing/meter"
import type { AccountPlan } from "@/lib/billing/meter-core"
import { AdminSetPlanSchema } from "@/lib/billing/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/billing — `{ user_id, plan, monthly_credits? }` (ADMIN_EMAILS
 * only). Moves an account to free / credits / team / custom and fills this
 * month's credits, until checkout exists. The user's account ID is shown in
 * Settings → Plan and included in the plan request email.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminForApi()
    if (!admin.ok) return admin.response
    const body = await request.json().catch(() => ({}))
    const parsed = parseOrError(AdminSetPlanSchema, body)
    if (!parsed.ok) return parsed.response
    const result = await setAccountPlan({
      userId: parsed.data.user_id,
      plan: parsed.data.plan as AccountPlan,
      monthlyCredits: parsed.data.monthly_credits,
    })
    console.info(`[billing] ${admin.reviewer} set ${parsed.data.user_id} to ${result.plan} (${result.monthly_credits}/month)`)
    return jsonOk({ user_id: parsed.data.user_id, ...result })
  } catch (err) {
    return handleRouteError(err)
  }
}
