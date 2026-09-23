/**
 * Hourly notify run (plan P6.4): page through candidate users, plan with the
 * pure planner, then for each planned (user, kind, channel):
 *
 *   1. claim — INSERT into app.notification_log first (unique per
 *      user/kind/channel/local_date). A lost race or an existing row means
 *      someone else owns it → skip. This is what makes the cron idempotent.
 *   2. send  — email via EmailSender, push to every subscription via
 *      PushSender (404/410 → delete the subscription).
 *   3. finish — mark the row sent / skipped / failed with provider detail.
 *
 * Storage is behind `NotifyStore` so this orchestration is unit-tested with
 * an in-memory store; `store.ts` is the Postgres implementation.
 */
import type { EmailSender } from "./email"
import { listUnsubscribeHeaders } from "./email"
import {
  planForUser,
  type LogStatus,
  type NotificationKind,
  type PlannedNotification,
  type PlannerUser,
} from "./plan"
import type { PushSender, PushSubscriptionRecord } from "./push"
import {
  renderDailyReminder,
  renderPush,
  renderStreakAtRisk,
  renderWeeklyRecap,
  type EmailContent,
  type WeeklyRecapData,
} from "./templates"
import { addDays } from "./time"
import { signUnsubscribeToken, unsubscribeUrl } from "./token"

export interface NotifyStore {
  /** Users with any channel on and not paused, ordered by id (keyset page). */
  listCandidates(page: {
    afterUserId: string | null
    limit: number
    /** Oldest local date to include in activity/log (UTC date − 8 days). */
    sinceDate: string
  }): Promise<PlannerUser[]>
  /** Insert-first claim. Returns the log row id, or null when already claimed. */
  claim(planned: PlannedNotification): Promise<string | null>
  finish(id: string, status: LogStatus, detail: Record<string, unknown>): Promise<void>
  dueCardCount(userId: string, now: Date): Promise<number>
  weeklyRecap(userId: string, localDate: string): Promise<Omit<WeeklyRecapData, "streak">>
  pushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>
  deletePushSubscription(endpoint: string): Promise<void>
}

export type NotifyRunOptions = {
  store: NotifyStore
  email: EmailSender
  push: PushSender
  now: Date
  appUrl: string
  /** Unsubscribe token secret; null leaves the unsubscribe link out. */
  signingSecret: string | null
  batchSize?: number
  /** Hard stop so one run stays well inside the function timeout. */
  maxUsers?: number
  /** Plan only — no claims, no sends. */
  dryRun?: boolean
}

export type NotifyRunSummary = {
  now: string
  dry_run: boolean
  channels: { email: boolean; push: boolean }
  users_scanned: number
  planned: number
  sent: number
  skipped: number
  failed: number
  already_claimed: number
  push_subscriptions_removed: number
  by_kind: Record<NotificationKind, number>
  planned_items?: Array<{ user_id: string; kind: NotificationKind; channel: string; local_date: string }>
}

type Outcome = { status: LogStatus; detail: Record<string, unknown>; removed?: number }

function emptyByKind(): Record<NotificationKind, number> {
  return { daily_reminder: 0, streak_at_risk: 0, weekly_recap: 0 }
}

async function buildEmail(
  planned: PlannedNotification,
  store: NotifyStore,
  options: NotifyRunOptions,
  unsubscribe: string | null,
): Promise<EmailContent> {
  const links = { appUrl: options.appUrl, unsubscribeUrl: unsubscribe }
  const { context } = planned
  if (planned.kind === "daily_reminder") {
    const cardsDue = await store.dueCardCount(planned.userId, options.now)
    return renderDailyReminder(
      { streak: context.streak, cardsDue, cardsDoneToday: context.cardsDoneToday, goal: context.goalToday },
      links,
    )
  }
  if (planned.kind === "streak_at_risk") {
    return renderStreakAtRisk(
      {
        streak: context.streak,
        freezes: context.freezes,
        cardsDoneToday: context.cardsDoneToday,
        goal: context.goalToday,
      },
      links,
    )
  }
  const recap = await store.weeklyRecap(planned.userId, planned.localDate)
  return renderWeeklyRecap({ ...recap, streak: context.streak }, links)
}

async function deliver(
  planned: PlannedNotification,
  user: PlannerUser,
  options: NotifyRunOptions,
): Promise<Outcome> {
  const { store } = options
  if (planned.channel === "email") {
    if (!user.email) return { status: "skipped", detail: { reason: "no email address" } }
    const unsubscribe = options.signingSecret
      ? unsubscribeUrl(options.appUrl, signUnsubscribeToken(user.userId, options.signingSecret, { now: options.now }))
      : null
    const content = await buildEmail(planned, store, options, unsubscribe)
    const result = await options.email.send({
      to: user.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: listUnsubscribeHeaders(unsubscribe),
      idempotencyKey: `${planned.userId}:${planned.kind}:email:${planned.localDate}`,
    })
    if (result.status === "sent") {
      return { status: "sent", detail: { provider: result.provider, provider_id: result.id, subject: content.subject } }
    }
    if (result.status === "skipped") return { status: "skipped", detail: { reason: result.reason } }
    return {
      status: "failed",
      detail: { provider: result.provider, error: result.error, http_status: result.httpStatus ?? null },
    }
  }

  if (planned.kind === "weekly_recap") {
    return { status: "skipped", detail: { reason: "weekly recap is email-only" } }
  }
  const subscriptions = await store.pushSubscriptions(user.userId)
  if (subscriptions.length === 0) return { status: "skipped", detail: { reason: "no push subscription" } }
  const cardsDue =
    planned.kind === "daily_reminder" ? await store.dueCardCount(user.userId, options.now) : 0
  const content = renderPush(planned.kind, {
    streak: planned.context.streak,
    cardsDue,
    cardsDoneToday: planned.context.cardsDoneToday,
    goal: planned.context.goalToday,
  })
  let delivered = 0
  let removed = 0
  const errors: string[] = []
  let skippedReason: string | null = null
  for (const subscription of subscriptions) {
    const result = await options.push.send(subscription, content)
    if (result.status === "sent") delivered += 1
    else if (result.status === "gone") {
      await store.deletePushSubscription(subscription.endpoint)
      removed += 1
    } else if (result.status === "skipped") skippedReason = result.reason
    else errors.push(result.error)
  }
  const detail = { endpoints: subscriptions.length, delivered, removed, title: content.title }
  if (delivered > 0) return { status: "sent", detail, removed }
  if (skippedReason) return { status: "skipped", detail: { ...detail, reason: skippedReason }, removed }
  if (errors.length > 0) return { status: "failed", detail: { ...detail, errors: errors.slice(0, 3) }, removed }
  return { status: "skipped", detail: { ...detail, reason: "all subscriptions expired" }, removed }
}

export async function runNotify(options: NotifyRunOptions): Promise<NotifyRunSummary> {
  const channels = { email: options.email.configured, push: options.push.configured }
  const summary: NotifyRunSummary = {
    now: options.now.toISOString(),
    dry_run: Boolean(options.dryRun),
    channels,
    users_scanned: 0,
    planned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    already_claimed: 0,
    push_subscriptions_removed: 0,
    by_kind: emptyByKind(),
    ...(options.dryRun ? { planned_items: [] } : {}),
  }
  if (!channels.email && !channels.push) return summary

  const batchSize = options.batchSize ?? 500
  const maxUsers = options.maxUsers ?? 20_000
  const sinceDate = addDays(options.now.toISOString().slice(0, 10), -8)
  let afterUserId: string | null = null

  while (summary.users_scanned < maxUsers) {
    const users = await options.store.listCandidates({ afterUserId, limit: batchSize, sinceDate })
    if (users.length === 0) break
    afterUserId = users[users.length - 1]!.userId
    summary.users_scanned += users.length

    for (const user of users) {
      const plan = planForUser(user, { now: options.now, channels })
      for (const planned of plan.planned) {
        summary.planned += 1
        if (options.dryRun) {
          summary.planned_items?.push({
            user_id: planned.userId,
            kind: planned.kind,
            channel: planned.channel,
            local_date: planned.localDate,
          })
          continue
        }
        const id = await options.store.claim(planned)
        if (!id) {
          summary.already_claimed += 1
          continue
        }
        let outcome: Outcome
        try {
          outcome = await deliver(planned, user, options)
        } catch (err) {
          outcome = {
            status: "failed",
            detail: { error: err instanceof Error ? err.message.slice(0, 300) : String(err) },
          }
        }
        summary.push_subscriptions_removed += outcome.removed ?? 0
        try {
          await options.store.finish(id, outcome.status, outcome.detail)
        } catch (err) {
          console.warn("[notify] could not update notification_log", id, err)
        }
        if (outcome.status === "sent") {
          summary.sent += 1
          summary.by_kind[planned.kind] += 1
        } else if (outcome.status === "skipped") summary.skipped += 1
        else summary.failed += 1
      }
    }
    if (users.length < batchSize) break
  }
  return summary
}
