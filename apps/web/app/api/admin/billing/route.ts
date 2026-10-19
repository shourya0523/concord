import { handleRouteError, jsonError, jsonOk, parseOrError } from "@/lib/api/http"
import { requireAdminForApi } from "@/lib/admin/session"
import { isByokAvailable, looksLikeOpenRouterKey, verifyOpenRouterKey } from "@/lib/billing/byok"
import { clearOrgKey, saveOrgKey, setAccountPlan } from "@/lib/billing/meter"
import type { AccountPlan } from "@/lib/billing/meter-core"
import { ORG_KEY_PLANS } from "@/lib/billing/plans"
import { AdminSetPlanSchema } from "@/lib/billing/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/billing (ADMIN_EMAILS only), until checkout exists:
 *
 *   { user_id | user_ids, plan, monthly_credits?, openrouter_key?, remove_org_key? }
 *
 * Moves accounts to Standby / Supersonic / Charter / Fleet (free / credits /
 * team / custom) and fills this month's credits. Bring-your-own-key is a
 * Charter / Fleet perk: `openrouter_key` is checked with OpenRouter once,
 * stored encrypted on every seat, and those members run on it with no caps.
 * Individuals can't add a key. Moving a seat off Charter / Fleet, or
 * `remove_org_key`, drops the key.
 *
 * Account IDs are shown in Settings → Plan and included in plan request emails.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminForApi()
    if (!admin.ok) return admin.response
    const body = await request.json().catch(() => ({}))
    const parsed = parseOrError(AdminSetPlanSchema, body)
    if (!parsed.ok) return parsed.response
    const { plan, monthly_credits, openrouter_key, remove_org_key } = parsed.data
    const userIds = [...new Set(parsed.data.user_ids ?? [parsed.data.user_id!])]

    if (openrouter_key) {
      if (!isByokAvailable()) {
        return jsonError(503, "byok_unavailable", "Set BYOK_ENCRYPTION_KEY to store organisation keys.")
      }
      if (!looksLikeOpenRouterKey(openrouter_key)) {
        return jsonError(400, "validation_error", "openrouter_key doesn't look like an OpenRouter key (sk-or-…).")
      }
      const check = await verifyOpenRouterKey(openrouter_key)
      if (!check.ok) return jsonError(check.reason === "invalid" ? 400 : 502, `key_${check.reason}`, check.message)
    }

    const orgKeyPlan = (ORG_KEY_PLANS as readonly string[]).includes(plan)
    const seats = []
    for (const userId of userIds) {
      const result = await setAccountPlan({ userId, plan: plan as AccountPlan, monthlyCredits: monthly_credits })
      let orgKey: "set" | "removed" | "unchanged" = "unchanged"
      if (openrouter_key) {
        await saveOrgKey(userId, openrouter_key)
        orgKey = "set"
      } else if ((remove_org_key || !orgKeyPlan) && (await clearOrgKey(userId))) {
        orgKey = "removed"
      }
      seats.push({ user_id: userId, ...result, org_key: orgKey })
    }
    console.info(
      `[billing] ${admin.reviewer} set ${seats.length} seat(s) to ${plan}` +
        (openrouter_key ? " with an organisation key" : remove_org_key ? ", organisation key removed" : ""),
    )
    return jsonOk({ seats })
  } catch (err) {
    return handleRouteError(err)
  }
}
