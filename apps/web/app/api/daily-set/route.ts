import { handleRouteError, jsonError, parseOrError, respondTyped } from "@/lib/api/http"
import { getApiUser } from "@/lib/api/auth"
import {
  DailySetActionRequestSchema,
  DailySetActionResponseSchema,
  DailySetResponseSchema,
} from "@/lib/api/retention-schemas"
import { recordLearningActivity } from "@/lib/data/activity"
import { findItemEvidence, getOrCreateDailySet } from "@/lib/data/daily-set"
import { isFlagOn } from "@/lib/flags"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/daily-set — today's frozen set (built on first request of the local day). */
export async function GET() {
  try {
    if (!isFlagOn("daily_set")) return jsonError(404, "not_found", "Daily set is turned off")
    const user = await getApiUser("view today's set")
    if (!user.ok) return user.response
    return respondTyped(
      DailySetResponseSchema,
      await getOrCreateDailySet({ userId: user.userId, email: user.email }),
    )
  } catch (err) {
    return handleRouteError(err)
  }
}

/**
 * POST /api/daily-set {action: "complete", item_id} — mark a card done after
 * its graded attempt. Idempotent: when the attempts / drills API already
 * reported the activity the item is done and `activity` is null. The score is
 * never taken from the client — it comes from the stored attempt.
 */
export async function POST(request: Request) {
  try {
    if (!isFlagOn("daily_set")) return jsonError(404, "not_found", "Daily set is turned off")
    const user = await getApiUser("update today's set")
    if (!user.ok) return user.response
    const body = await request.json().catch(() => ({}))
    const parsed = parseOrError(DailySetActionRequestSchema, body)
    if (!parsed.ok) return parsed.response

    const current = await getOrCreateDailySet({ userId: user.userId, email: user.email })
    const item = current.set.items.find((entry) => entry.id === parsed.data.item_id)
    if (!item) return jsonError(404, "not_found", "No such card in today's set")
    if (item.done_at) {
      return respondTyped(DailySetActionResponseSchema, {
        set: current.set,
        item,
        activity: null,
        source: current.source,
      })
    }

    const evidence = await findItemEvidence({ userId: user.userId, item })
    if (!evidence) {
      return jsonError(409, "not_answered", "Answer this card first — no graded attempt found yet")
    }
    const countsTowardGoal =
      evidence.scoreSource !== "reveal_copy" &&
      !(evidence.scoreSource === "self" && evidence.responseEmpty && evidence.score == null)
    const activity = await recordLearningActivity({
      userId: user.userId,
      email: user.email,
      kind: item.kind === "drill" ? "drill" : "attempt",
      subjectId: item.subject_id,
      score: evidence.score,
      scoreSource: evidence.scoreSource,
      countsTowardGoal,
    })
    const after = await getOrCreateDailySet({ userId: user.userId, email: user.email })
    const updated = after.set.items.find((entry) => entry.id === item.id) ?? item
    return respondTyped(DailySetActionResponseSchema, {
      set: after.set,
      item: updated,
      activity,
      source: after.source,
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
