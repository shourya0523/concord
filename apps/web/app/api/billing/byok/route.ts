import { getApiUser } from "@/lib/api/auth"
import { jsonError, parseOrError, respondTyped } from "@/lib/api/http"
import { isByokAvailable, looksLikeOpenRouterKey, verifyOpenRouterKey } from "@/lib/billing/byok"
import { removeByokKey, saveByokKey, usageSummary } from "@/lib/billing/meter"
import { ByokSaveSchema, UsageSummarySchema } from "@/lib/billing/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/billing/byok — `{ key }`: check the OpenRouter key with OpenRouter,
 * then store it encrypted. From then on this user's grading, coaching and
 * voice answers run on their key with no daily caps.
 * DELETE /api/billing/byok — forget the key.
 *
 * Errors here never echo the key or a raw database message.
 */
export async function PUT(request: Request) {
  const user = await getApiUser("save an API key")
  if (!user.ok) return user.response
  if (!isByokAvailable()) {
    return jsonError(503, "byok_unavailable", "Bring-your-own-key isn't enabled on this server yet.")
  }
  const body = await request.json().catch(() => ({}))
  const parsed = parseOrError(ByokSaveSchema, body)
  if (!parsed.ok) return parsed.response
  const { key } = parsed.data
  if (!looksLikeOpenRouterKey(key)) {
    return jsonError(400, "validation_error", "That doesn't look like an OpenRouter key (it starts with sk-or-).")
  }
  const check = await verifyOpenRouterKey(key)
  if (!check.ok) return jsonError(check.reason === "invalid" ? 400 : 502, `key_${check.reason}`, check.message)
  try {
    await saveByokKey(user.userId, key, user.email)
    return respondTyped(UsageSummarySchema, await usageSummary(user.userId))
  } catch (err) {
    console.error("[billing] saving BYOK key failed", err instanceof Error ? err.name : "error")
    return jsonError(503, "byok_save_failed", "Couldn't save the key right now. Try again.")
  }
}

export async function DELETE() {
  const user = await getApiUser("remove an API key")
  if (!user.ok) return user.response
  try {
    await removeByokKey(user.userId)
    return respondTyped(UsageSummarySchema, await usageSummary(user.userId))
  } catch (err) {
    console.error("[billing] removing BYOK key failed", err instanceof Error ? err.name : "error")
    return jsonError(503, "byok_remove_failed", "Couldn't remove the key right now. Try again.")
  }
}
