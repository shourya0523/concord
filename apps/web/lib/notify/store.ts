/**
 * Postgres implementation of NotifyStore. Runs on the cron (owner) connection
 * from `./db` — no RLS GUC, every query filters by user_id explicitly.
 */
import { randomUUID } from "node:crypto"
import { PrepProfileSchema } from "@/lib/data/profile"
import { TOPIC_LABELS, topicForConceptId } from "@/lib/topics"
import type { SqlClient } from "./db"
import type {
  LogStatus,
  NotificationChannel,
  NotificationKind,
  PlannedNotification,
  PlannerUser,
} from "./plan"
import type { PushSubscriptionRecord } from "./push"
import type { NotifyStore } from "./run"
import type { RecapFirm, WeeklyRecapData } from "./templates"
import { addDays, toIsoDate } from "./time"

type CandidateRow = {
  user_id: string
  email: string | null
  profile: unknown
  paused: boolean
  current_streak: number | null
  last_goal_date: string | null
  freezes: number | null
  has_push: boolean
  activity: Array<{
    local_date: string
    goal_met: boolean
    freeze_used: boolean
    cards_done: number
    goal: number
  }> | null
  log: Array<{
    kind: NotificationKind
    channel: NotificationChannel
    local_date: string
    status: LogStatus
  }> | null
}

export function candidateFromRow(row: CandidateRow): PlannerUser {
  const parsed = PrepProfileSchema.safeParse(row.profile ?? {})
  const profile = parsed.success ? parsed.data : PrepProfileSchema.parse({})
  return {
    userId: row.user_id,
    email: row.email,
    timezone: profile.timezone,
    reminderHour: profile.reminder_hour,
    notifyEmail: profile.notify_email,
    notifyPush: profile.notify_push,
    weeklyRecap: profile.weekly_recap,
    paused: Boolean(row.paused),
    hasPushSubscription: Boolean(row.has_push),
    streak:
      row.current_streak === null
        ? null
        : {
            current: Number(row.current_streak),
            lastGoalDate: toIsoDate(row.last_goal_date),
            freezes: Number(row.freezes ?? 0),
          },
    activity: (row.activity ?? []).map((a) => ({
      localDate: toIsoDate(a.local_date) ?? a.local_date,
      goalMet: Boolean(a.goal_met),
      freezeUsed: Boolean(a.freeze_used),
      cardsDone: Number(a.cards_done),
      goal: Number(a.goal),
    })),
    log: (row.log ?? []).map((l) => ({
      kind: l.kind,
      channel: l.channel,
      localDate: toIsoDate(l.local_date) ?? l.local_date,
      status: l.status,
    })),
  }
}

function humanise(id: string): string {
  const base = id.replace(/^concept_/, "").replace(/[_-]+/g, " ").trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : id
}

export function postgresNotifyStore(sql: SqlClient): NotifyStore {
  return {
    async listCandidates({ afterUserId, limit, sinceDate }) {
      const rows = (await sql`
        SELECT
          u.id AS user_id,
          u.email,
          p.preferences_json -> 'profile' AS profile,
          coalesce((p.preferences_json -> 'notify' ->> 'paused')::boolean, false) AS paused,
          s.current_streak,
          s.last_goal_date::text AS last_goal_date,
          s.freezes,
          EXISTS (SELECT 1 FROM app.push_subscriptions ps WHERE ps.user_id = u.id) AS has_push,
          (
            SELECT json_agg(json_build_object(
              'local_date', a.local_date::text, 'goal_met', a.goal_met,
              'freeze_used', a.freeze_used, 'cards_done', a.cards_done, 'goal', a.goal
            ) ORDER BY a.local_date)
            FROM app.daily_activity a
            WHERE a.user_id = u.id AND a.local_date >= ${sinceDate}::date
          ) AS activity,
          (
            SELECT json_agg(json_build_object(
              'kind', l.kind, 'channel', l.channel,
              'local_date', l.local_date::text, 'status', l.status
            ))
            FROM app.notification_log l
            WHERE l.user_id = u.id AND l.local_date >= ${sinceDate}::date
          ) AS log
        FROM app.users u
        JOIN app.user_profiles p ON p.user_id = u.id
        LEFT JOIN app.user_streaks s ON s.user_id = u.id
        WHERE (${afterUserId}::text IS NULL OR u.id > ${afterUserId}::text)
          AND coalesce((p.preferences_json -> 'notify' ->> 'paused')::boolean, false) = false
          AND (
            coalesce((p.preferences_json -> 'profile' ->> 'notify_email')::boolean, true)
            OR coalesce((p.preferences_json -> 'profile' ->> 'notify_push')::boolean, false)
          )
        ORDER BY u.id
        LIMIT ${limit}
      `) as CandidateRow[]
      return rows.map(candidateFromRow)
    },

    async claim(planned: PlannedNotification) {
      const id = `ntf_${randomUUID().replace(/-/g, "").slice(0, 24)}`
      const detail = JSON.stringify({
        phase: "claimed",
        time_zone: planned.timeZone,
        local_hour: planned.context.localHour,
      })
      const rows = (await sql`
        INSERT INTO app.notification_log
          (id, user_id, kind, channel, local_date, status, detail_json)
        VALUES
          (${id}, ${planned.userId}, ${planned.kind}, ${planned.channel},
           ${planned.localDate}::date, 'sent', ${detail}::jsonb)
        ON CONFLICT (user_id, kind, channel, local_date) DO UPDATE SET
          status = 'sent',
          detail_json = EXCLUDED.detail_json ||
            jsonb_build_object('retry_of', app.notification_log.detail_json),
          created_at = now()
        WHERE app.notification_log.status = 'failed'
        RETURNING id
      `) as Array<{ id: string }>
      return rows[0]?.id ?? null
    },

    async finish(id, status, detail) {
      await sql`
        UPDATE app.notification_log
        SET status = ${status},
            detail_json = detail_json || ${JSON.stringify({ ...detail, phase: "done" })}::jsonb
        WHERE id = ${id}
      `
    },

    async dueCardCount(userId, now) {
      const rows = (await sql`
        SELECT count(*)::int AS due
        FROM app.review_queue
        WHERE user_id = ${userId} AND due_at <= ${now.toISOString()}::timestamptz
      `) as Array<{ due: number }>
      return Number(rows[0]?.due ?? 0)
    },

    async weeklyRecap(userId, localDate): Promise<Omit<WeeklyRecapData, "streak">> {
      const weekFrom = addDays(localDate, -6)
      const priorCutoff = addDays(localDate, -7)
      const staleCutoff = addDays(localDate, -14)
      const [activityRows, firmRows, masteryRows] = (await Promise.all([
        sql`
          SELECT coalesce(sum(xp), 0)::int AS xp,
                 count(*) FILTER (WHERE goal_met)::int AS days_goal_met
          FROM app.daily_activity
          WHERE user_id = ${userId}
            AND local_date BETWEEN ${weekFrom}::date AND ${localDate}::date
        `,
        sql`
          WITH latest AS (
            SELECT DISTINCT ON (firm_id) firm_id, readiness, local_date
            FROM app.readiness_snapshots
            WHERE user_id = ${userId} AND local_date <= ${localDate}::date
            ORDER BY firm_id, local_date DESC
          ),
          prior AS (
            SELECT DISTINCT ON (firm_id) firm_id, readiness
            FROM app.readiness_snapshots
            WHERE user_id = ${userId} AND local_date <= ${priorCutoff}::date
            ORDER BY firm_id, local_date DESC
          )
          SELECT l.firm_id,
                 coalesce(f.name, l.firm_id) AS name,
                 l.readiness,
                 p.readiness AS prior_readiness,
                 (t.primary_firm_id IS NOT NULL AND t.primary_firm_id = l.firm_id) AS is_primary
          FROM latest l
          LEFT JOIN prior p ON p.firm_id = l.firm_id
          LEFT JOIN canonical.firms f ON f.id = l.firm_id
          LEFT JOIN app.target_company_sets t ON t.user_id = ${userId}
          WHERE l.local_date > ${staleCutoff}::date
            AND (
              t.user_id IS NULL
              OR jsonb_array_length(t.firm_ids) = 0
              OR t.firm_ids ? l.firm_id
            )
          ORDER BY is_primary DESC, l.readiness DESC
          LIMIT 5
        `,
        sql`
          SELECT concept_id, mastery
          FROM app.mastery_records
          WHERE user_id = ${userId} AND concept_id IS NOT NULL AND question_id IS NULL
          ORDER BY mastery ASC
          LIMIT 20
        `,
      ])) as [
        Array<{ xp: number; days_goal_met: number }>,
        Array<{ firm_id: string; name: string; readiness: number; prior_readiness: number | null }>,
        Array<{ concept_id: string; mastery: number }>,
      ]

      const firms: RecapFirm[] = firmRows.map((row) => ({
        name: row.name,
        readiness: Number(row.readiness),
        delta:
          row.prior_readiness === null || row.prior_readiness === undefined
            ? null
            : Number(row.readiness) - Number(row.prior_readiness),
      }))

      // Lowest mastery concept, preferring one that maps to a taxonomy topic.
      const mapped = masteryRows.find((row) => topicForConceptId(row.concept_id))
      const weakestRow = mapped ?? masteryRows[0]
      let weakestTopic: WeeklyRecapData["weakestTopic"] = null
      if (weakestRow && Number(weakestRow.mastery) < 0.85) {
        const topic = topicForConceptId(weakestRow.concept_id)
        weakestTopic = {
          label: topic ? (TOPIC_LABELS[topic] ?? topic) : humanise(weakestRow.concept_id),
          score: Number(weakestRow.mastery),
        }
      }

      const lowest = [...firms].sort((a, b) => a.readiness - b.readiness)[0]
      return {
        xpWeek: Number(activityRows[0]?.xp ?? 0),
        daysGoalMet: Number(activityRows[0]?.days_goal_met ?? 0),
        firms,
        weakestTopic,
        nextMock: lowest ? { firmName: lowest.name } : null,
      }
    },

    async pushSubscriptions(userId): Promise<PushSubscriptionRecord[]> {
      return (await sql`
        SELECT endpoint, p256dh, auth
        FROM app.push_subscriptions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 10
      `) as PushSubscriptionRecord[]
    },

    async deletePushSubscription(endpoint) {
      await sql`DELETE FROM app.push_subscriptions WHERE endpoint = ${endpoint}`
    },
  }
}
