/**
 * Reminder planner (plan 2026-09-23-001 P6.4) — pure: given each user's
 * prefs, timezone, streak/activity and today's notification log, decide which
 * (user, kind, channel) the hourly cron should send at `now`.
 *
 * Rules
 * - daily_reminder  at the local `reminder_hour` when today's goal is unmet
 * - streak_at_risk  at 20:00 local when the live streak is ≥ 3 and the goal
 *                   is unmet (supersedes the daily reminder that day)
 * - weekly_recap    Sunday 18:00 local when `weekly_recap` is on (email only)
 * - each kind fires in a window [hour, hour + graceHours) so a late or
 *   skipped cron run, or a DST spring-forward gap, still delivers once
 * - cadence "daily" (default for deployments: Vercel Hobby only runs crons
 *   once a day) drops the hour windows — the one run a day sends the daily
 *   reminder when reminders are on and today's goal is unmet, the
 *   streak-at-risk nudge instead when a ≥ 3-day streak is at stake, and the
 *   weekly recap on the user's local Sunday. Cadence "hourly" keeps windows.
 * - at most `maxPerDay` distinct kinds per user per local day
 * - idempotent: a (kind, channel, local_date) already logged as sent/skipped
 *   is never planned again. Failed rows may be retried inside the window
 *   (the DB claim only re-opens rows whose status is `failed`).
 */
import { addDays, localParts, type LocalParts } from "./time"

export const NOTIFICATION_KINDS = ["daily_reminder", "streak_at_risk", "weekly_recap"] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const NOTIFICATION_CHANNELS = ["email", "push"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export type LogStatus = "sent" | "skipped" | "failed"

export const STREAK_AT_RISK_HOUR = 20
export const STREAK_AT_RISK_MIN = 3
export const WEEKLY_RECAP_HOUR = 18
/** 0 = Sunday. */
export const WEEKLY_RECAP_WEEKDAY = 0
export const DEFAULT_GRACE_HOURS = 2

export const NOTIFY_CADENCES = ["daily", "hourly"] as const
export type NotifyCadence = (typeof NOTIFY_CADENCES)[number]
/** UTC hour of the daily Vercel cron (apps/web/vercel.json `0 13 * * *`). */
export const DAILY_RUN_UTC_HOUR = 13

/** `NOTIFY_CADENCE=hourly` once the cron runs hourly (e.g. Vercel Pro). */
export function notifyCadence(env: Record<string, string | undefined> = process.env): NotifyCadence {
  return env.NOTIFY_CADENCE?.trim().toLowerCase() === "hourly" ? "hourly" : "daily"
}
export const DEFAULT_MAX_PER_DAY = 2

/** Higher first — wins when the daily cap is tight. */
export const KIND_PRIORITY: readonly NotificationKind[] = [
  "streak_at_risk",
  "daily_reminder",
  "weekly_recap",
]

export type PlannerActivity = {
  localDate: string
  goalMet: boolean
  freezeUsed: boolean
  cardsDone: number
  goal: number
}

export type PlannerLogEntry = {
  kind: NotificationKind
  channel: NotificationChannel
  localDate: string
  status: LogStatus
}

export type PlannerUser = {
  userId: string
  email: string | null
  timezone: string | null
  reminderHour: number | null
  notifyEmail: boolean
  notifyPush: boolean
  weeklyRecap: boolean
  /** "Pause all" in Settings. */
  paused: boolean
  hasPushSubscription: boolean
  streak: {
    current: number
    lastGoalDate: string | null
    freezes: number
  } | null
  /** Recent daily_activity rows (a week is plenty). */
  activity: PlannerActivity[]
  /** Recent notification_log rows. */
  log: PlannerLogEntry[]
}

export type PlannerOptions = {
  now: Date
  /** Provider availability — a channel with no provider is never planned. */
  channels: { email: boolean; push: boolean }
  graceHours?: number
  maxPerDay?: number
  /** Default "hourly" keeps the windowed rules; the cron passes notifyCadence(). */
  cadence?: NotifyCadence
}

export type PlannedNotification = {
  userId: string
  kind: NotificationKind
  channel: NotificationChannel
  localDate: string
  timeZone: string
  context: {
    localHour: number
    streak: number
    freezes: number
    goalMetToday: boolean
    cardsDoneToday: number
    goalToday: number | null
  }
}

export type UserPlan = {
  userId: string
  local: LocalParts
  planned: PlannedNotification[]
  /** Why nothing (or less than everything due) was planned — for logs/tests. */
  notes: string[]
}

export function inWindow(hour: number, target: number, graceHours: number): boolean {
  return hour >= target && hour < target + Math.max(1, graceHours)
}

function activityOn(user: PlannerUser, localDate: string): PlannerActivity | undefined {
  return user.activity.find((row) => row.localDate === localDate)
}

export function goalMetOn(user: PlannerUser, localDate: string): boolean {
  if (activityOn(user, localDate)?.goalMet) return true
  return user.streak?.lastGoalDate === localDate
}

/**
 * Streak still alive as of `localDate` (before today's goal): last goal day
 * was yesterday, or every missed day since was covered by a freeze, or a
 * single missed day can still be covered by a banked freeze (P5.3 applies it
 * lazily). Otherwise the stored counter is stale and the streak is 0.
 */
export function liveStreak(user: PlannerUser, localDate: string): number {
  const streak = user.streak
  if (!streak || streak.current <= 0 || !streak.lastGoalDate) return 0
  const yesterday = addDays(localDate, -1)
  if (streak.lastGoalDate >= yesterday) return streak.current

  let cursor = addDays(streak.lastGoalDate, 1)
  let uncovered = 0
  while (cursor <= yesterday) {
    if (!activityOn(user, cursor)?.freezeUsed) uncovered += 1
    cursor = addDays(cursor, 1)
    if (uncovered > 1) return 0
  }
  if (uncovered === 0) return streak.current
  return streak.freezes > 0 ? streak.current : 0
}

function channelsFor(
  user: PlannerUser,
  kind: NotificationKind,
  available: PlannerOptions["channels"],
): NotificationChannel[] {
  const out: NotificationChannel[] = []
  if (user.notifyEmail && user.email && available.email) out.push("email")
  if (kind !== "weekly_recap" && user.notifyPush && user.hasPushSubscription && available.push) {
    out.push("push")
  }
  return out
}

/** Plan one user's notifications for the cron run at `options.now`. */
export function planForUser(user: PlannerUser, options: PlannerOptions): UserPlan {
  const graceHours = options.graceHours ?? DEFAULT_GRACE_HOURS
  const maxPerDay = options.maxPerDay ?? DEFAULT_MAX_PER_DAY
  const local = localParts(options.now, user.timezone)
  const notes: string[] = []
  const plan: UserPlan = { userId: user.userId, local, planned: [], notes }

  if (user.paused) {
    notes.push("paused")
    return plan
  }

  const today = local.localDate
  const goalMetToday = goalMetOn(user, today)
  const streak = liveStreak(user, today)
  const todayActivity = activityOn(user, today)
  const todayLog = user.log.filter((row) => row.localDate === today)
  const loggedDone = (kind: NotificationKind, channel: NotificationChannel) =>
    todayLog.some(
      (row) => row.kind === kind && row.channel === channel && row.status !== "failed",
    )
  const deliveredKinds = new Set(
    todayLog.filter((row) => row.status === "sent").map((row) => row.kind),
  )

  const daily = options.cadence === "daily"
  const at = (target: number) => daily || inWindow(local.hour, target, graceHours)
  const due = new Set<NotificationKind>()
  if (user.reminderHour !== null && at(user.reminderHour) && !goalMetToday) {
    due.add("daily_reminder")
  }
  if (streak >= STREAK_AT_RISK_MIN && !goalMetToday && at(STREAK_AT_RISK_HOUR)) {
    due.add("streak_at_risk")
  }
  if (user.weeklyRecap && local.weekday === WEEKLY_RECAP_WEEKDAY && at(WEEKLY_RECAP_HOUR)) {
    due.add("weekly_recap")
  }

  // The at-risk nudge replaces a same-evening daily reminder.
  if (
    due.has("daily_reminder") &&
    (due.has("streak_at_risk") || deliveredKinds.has("streak_at_risk"))
  ) {
    due.delete("daily_reminder")
    notes.push("daily_reminder superseded by streak_at_risk")
  }

  let slots = Math.max(0, maxPerDay - deliveredKinds.size)
  for (const kind of KIND_PRIORITY) {
    if (!due.has(kind)) continue
    const channels = channelsFor(user, kind, options.channels).filter(
      (channel) => !loggedDone(kind, channel),
    )
    if (channels.length === 0) {
      notes.push(`${kind}: no open channel`)
      continue
    }
    if (!deliveredKinds.has(kind)) {
      if (slots <= 0) {
        notes.push(`${kind}: daily cap reached`)
        continue
      }
      slots -= 1
    }
    for (const channel of channels) {
      plan.planned.push({
        userId: user.userId,
        kind,
        channel,
        localDate: today,
        timeZone: local.timeZone,
        context: {
          localHour: local.hour,
          streak,
          freezes: user.streak?.freezes ?? 0,
          goalMetToday,
          cardsDoneToday: todayActivity?.cardsDone ?? 0,
          goalToday: todayActivity?.goal ?? null,
        },
      })
    }
  }
  return plan
}

export function planNotifications(
  users: PlannerUser[],
  options: PlannerOptions,
): PlannedNotification[] {
  return users.flatMap((user) => planForUser(user, options).planned)
}
