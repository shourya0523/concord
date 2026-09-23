/**
 * Per-user notification state that is not part of the prep profile:
 *   - "pause all"  → app.user_profiles.preferences_json.notify.paused
 *   - Web Push subscriptions → app.push_subscriptions
 * Channel/timing prefs (reminder_hour, notify_email, notify_push,
 * weekly_recap, timezone) live on the prep profile and are saved through
 * PUT /api/profile.
 *
 * All queries run as the signed-in user under RLS (`withRlsUserId`).
 */
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { ensureAppUserQuery } from "@/lib/data/users"
import { memoryStore } from "@/lib/data/memory-store"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { notifyCapabilities } from "./config"
import { DAILY_RUN_UTC_HOUR, NOTIFY_CADENCES, notifyCadence } from "./plan"

export const PushSubscribeRequestSchema = z.object({
  endpoint: z.string().url().max(2048).refine((v) => v.startsWith("https://"), "endpoint must be https"),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(128),
  }),
})
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequestSchema>

export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url().max(2048),
})

export const NotifyPrefsUpdateSchema = z.object({ paused: z.boolean() })

export const NotifyPrefsResponseSchema = z.object({
  /** `notifications` feature flag. */
  enabled: z.boolean(),
  /** `leagues` feature flag (Settings shows the opt-in only when on). */
  leagues_enabled: z.boolean(),
  paused: z.boolean(),
  /** "daily": one cron run a day (Hobby); "hourly": reminder_hour is honoured. */
  cadence: z.enum(NOTIFY_CADENCES),
  /** UTC hour of the daily run (shown as the user's local time). */
  daily_run_utc_hour: z.number().int().min(0).max(23),
  channels: z.object({
    email: z.object({ available: z.boolean() }),
    push: z.object({
      available: z.boolean(),
      vapid_public_key: z.string().nullable(),
      subscriptions: z.number().int().nonnegative(),
      /** Plan P6.3: push opt-in unlocks after the first completed daily goal. */
      unlocked: z.boolean(),
    }),
  }),
  source: z.enum(["published", "stub", "empty"]),
  note: z.string().optional(),
})
export type NotifyPrefsResponse = z.infer<typeof NotifyPrefsResponseSchema>

type StubState = { paused: boolean; subscriptions: Map<string, { p256dh: string; auth: string }> }
const stubState = memoryStore<string, StubState>("notify_state")

function stubFor(userId: string): StubState {
  let state = stubState.get(userId)
  if (!state) {
    state = { paused: false, subscriptions: new Map() }
    stubState.set(userId, state)
  }
  return state
}

export async function getNotifyPrefs(
  userId: string,
  flags: { notifications: boolean; leagues: boolean },
): Promise<NotifyPrefsResponse> {
  const caps = notifyCapabilities()
  const base = (paused: boolean, subscriptions: number, unlocked: boolean) => ({
    enabled: flags.notifications,
    leagues_enabled: flags.leagues,
    paused,
    cadence: notifyCadence(),
    daily_run_utc_hour: DAILY_RUN_UTC_HOUR,
    channels: {
      email: { available: caps.email },
      push: {
        available: caps.push,
        vapid_public_key: caps.push ? caps.vapidPublicKey : null,
        subscriptions,
        unlocked,
      },
    },
  })

  if (!isDatabaseConfigured()) {
    const state = stubFor(userId)
    return {
      ...base(state.paused, state.subscriptions.size, true),
      source: "stub",
      note: "DATABASE_URL unset — notification state kept in memory.",
    }
  }

  try {
    const sql = requireSql()
    const [prefRows, subRows, goalRows] = (await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT coalesce((p.preferences_json -> 'notify' ->> 'paused')::boolean, false) AS paused
        FROM app.user_profiles p
        JOIN app.users u ON u.id = p.user_id
        WHERE u.neon_auth_user_id = ${userId}
        LIMIT 1
      `,
      s`
        SELECT count(*)::int AS n
        FROM app.push_subscriptions ps
        JOIN app.users u ON u.id = ps.user_id
        WHERE u.neon_auth_user_id = ${userId}
      `,
      s`
        SELECT EXISTS (
          SELECT 1 FROM app.daily_activity a
          JOIN app.users u ON u.id = a.user_id
          WHERE u.neon_auth_user_id = ${userId} AND a.goal_met
        ) AS unlocked
      `,
    ])) as [Array<{ paused: boolean }>, Array<{ n: number }>, Array<{ unlocked: boolean }>]
    const subscriptions = Number(subRows[0]?.n ?? 0)
    return {
      // An existing subscription stays manageable even before the unlock.
      ...base(Boolean(prefRows[0]?.paused), subscriptions, Boolean(goalRows[0]?.unlocked) || subscriptions > 0),
      source: "published",
    }
  } catch (err) {
    console.warn("[notify] prefs read failed", err)
    return { ...base(false, 0, false), source: "empty", note: "Notification state read failed." }
  }
}

export async function setNotifyPaused(options: {
  userId: string
  email?: string | null
  paused: boolean
}): Promise<void> {
  const { userId, email, paused } = options
  if (!isDatabaseConfigured()) {
    stubFor(userId).paused = paused
    return
  }
  const notify = JSON.stringify({ paused, updated_at: new Date().toISOString() })
  const sql = requireSql()
  await withRlsUserId(sql, userId, (s) => [
    ensureAppUserQuery(s, userId, email),
    s`
      INSERT INTO app.user_profiles (user_id, preferences_json)
      VALUES (
        (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
        jsonb_build_object('notify', ${notify}::jsonb)
      )
      ON CONFLICT (user_id) DO UPDATE SET
        preferences_json = app.user_profiles.preferences_json ||
          jsonb_build_object('notify', ${notify}::jsonb)
    `,
  ])
}

export class PushEndpointConflictError extends Error {
  readonly status = 409
  constructor() {
    super("This browser's push endpoint is registered to another account.")
    this.name = "PushEndpointConflictError"
  }
}

export async function savePushSubscription(options: {
  userId: string
  email?: string | null
  subscription: PushSubscribeRequest
  userAgent?: string | null
}): Promise<void> {
  const { userId, email, subscription } = options
  if (!isDatabaseConfigured()) {
    stubFor(userId).subscriptions.set(subscription.endpoint, subscription.keys)
    return
  }
  const id = `push_${randomUUID().replace(/-/g, "").slice(0, 24)}`
  const userAgent = options.userAgent?.slice(0, 300) ?? null
  const sql = requireSql()
  let results: unknown[]
  try {
    results = await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
        VALUES (
          ${id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, ${userAgent}
        )
        ON CONFLICT (endpoint) DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent
        WHERE app.push_subscriptions.user_id = EXCLUDED.user_id
        RETURNING id
      `,
    ])
  } catch (err) {
    // Under RLS the conflicting row of another user is invisible, so the
    // upsert surfaces as a policy/unique violation.
    const code = (err as { code?: string }).code
    if (code === "23505" || code === "42501") throw new PushEndpointConflictError()
    throw err
  }
  // Owner connections bypass RLS: the WHERE above then skips another user's
  // row silently, so no returned row also means a conflict.
  const written = (results[1] ?? []) as Array<{ id: string }>
  if (written.length === 0) throw new PushEndpointConflictError()
}

export async function removePushSubscription(options: {
  userId: string
  endpoint: string
}): Promise<number> {
  const { userId, endpoint } = options
  if (!isDatabaseConfigured()) {
    return stubFor(userId).subscriptions.delete(endpoint) ? 1 : 0
  }
  const sql = requireSql()
  const [rows] = (await withRlsUserId(sql, userId, (s) => [
    s`
      DELETE FROM app.push_subscriptions
      WHERE endpoint = ${endpoint}
        AND user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
      RETURNING id
    `,
  ])) as [Array<{ id: string }>]
  return rows.length
}
