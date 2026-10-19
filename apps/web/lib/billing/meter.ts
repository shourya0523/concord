/**
 * AI usage metering + organisation-key service (DESIGN.md §17.4,
 * migration 064). Rules live in ./meter-core; this file stores them.
 *
 * Bring-your-own-key is a Charter / Fleet (team / custom) perk: an admin
 * stores the organisation's OpenRouter key on each seat, and it is only used
 * while the account is on one of those plans.
 *
 * Postgres (app.billing_accounts / ai_usage_daily / ai_usage_events, under
 * RLS) when DATABASE_URL is set, else a process-wide memory store like the
 * other lib/data modules. Each step is one atomic statement, so concurrent
 * requests can't overspend the free allowance or the credit balance.
 *
 * Metering fails open: if the tables are missing or the database errors, the
 * action is allowed and a warning is logged, so a billing outage never takes
 * grading down.
 */
import { randomUUID } from "node:crypto"

import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { memoryStore } from "@/lib/data/memory-store"

import { byokCipherKey, decryptKey, encryptKey, envWithKey, isByokAvailable, keyLast4 } from "./byok"
import {
  AI_ACTIONS,
  balanceFor,
  creditPeriod,
  defaultMonthlyCredits,
  nextCreditReset,
  nextDailyReset,
  usageDay,
  type AccountPlan,
  type AiAction,
  type Charge,
  type ChargeSource,
} from "./meter-core"
import { CREDIT_COST, CREDITS_PER_MONTH, FREE_DAILY_LIMITS, ORG_KEY_PLANS, SEAT_CREDITS_PER_MONTH } from "./plans"

type Account = {
  plan: AccountPlan
  monthlyCredits: number
  creditsBalance: number
  creditsPeriod: string | null
  byokCiphertext: string | null
  byokLast4: string | null
}

const EMPTY_ACCOUNT: Account = {
  plan: "free",
  monthlyCredits: 0,
  creditsBalance: 0,
  creditsPeriod: null,
  byokCiphertext: null,
  byokLast4: null,
}

type UsageEvent = { id: string; action: AiAction; source: ChargeSource; credits: number; ref: string | null }

interface BillingStore {
  getAccount(userId: string): Promise<Account | null>
  hasRef(userId: string, ref: string): Promise<boolean>
  /** Count one free use if under `limit`; false when the day's allowance is spent. */
  takeFree(userId: string, day: string, action: AiAction, limit: number, email?: string | null): Promise<boolean>
  /** Spend `cost` credits (refilling a stale month first); false when short. */
  takeCredits(userId: string, period: string, cost: number): Promise<boolean>
  /** false when `ref` was already charged (a concurrent duplicate). */
  recordEvent(userId: string, event: UsageEvent, email?: string | null): Promise<boolean>
  refund(userId: string, event: UsageEvent, day: string, period: string): Promise<void>
  usedOn(userId: string, day: string): Promise<Record<AiAction, number>>
  setByok(userId: string, blob: string | null, last4: string | null): Promise<void>
  setPlan(userId: string, plan: AccountPlan, monthlyCredits: number, period: string): Promise<void>
}

/* ------------------------------------------------------------------ */
/* Memory store (no DATABASE_URL)                                      */
/* ------------------------------------------------------------------ */

const memAccounts = memoryStore<string, Account>("billing_accounts")
const memDaily = memoryStore<string, number>("ai_usage_daily")
const memEvents = memoryStore<string, UsageEvent[]>("ai_usage_events")

const dailyKey = (userId: string, day: string, action: AiAction) => `${userId}|${day}|${action}`

const memoryBillingStore: BillingStore = {
  async getAccount(userId) {
    return memAccounts.get(userId) ?? null
  },
  async hasRef(userId, ref) {
    return (memEvents.get(userId) ?? []).some((event) => event.ref === ref)
  },
  async takeFree(userId, day, action, limit) {
    const key = dailyKey(userId, day, action)
    const used = memDaily.get(key) ?? 0
    if (used >= limit) return false
    memDaily.set(key, used + 1)
    return true
  },
  async takeCredits(userId, period, cost) {
    const account = memAccounts.get(userId)
    if (!account) return false
    const balance = balanceFor(account, period)
    if (balance < cost) return false
    memAccounts.set(userId, { ...account, creditsBalance: balance - cost, creditsPeriod: period })
    return true
  },
  async recordEvent(userId, event) {
    const events = memEvents.get(userId) ?? []
    if (event.ref && events.some((e) => e.ref === event.ref)) return false
    memEvents.set(userId, [...events, event])
    return true
  },
  async refund(userId, event, day, period) {
    if (event.source === "free") {
      const key = dailyKey(userId, day, event.action)
      memDaily.set(key, Math.max(0, (memDaily.get(key) ?? 0) - 1))
    }
    const account = memAccounts.get(userId)
    if (event.source === "credits" && account?.creditsPeriod === period) {
      memAccounts.set(userId, { ...account, creditsBalance: account.creditsBalance + event.credits })
    }
    memEvents.set(userId, (memEvents.get(userId) ?? []).filter((e) => e.id !== event.id))
  },
  async usedOn(userId, day) {
    return Object.fromEntries(AI_ACTIONS.map((a) => [a, memDaily.get(dailyKey(userId, day, a)) ?? 0])) as Record<
      AiAction,
      number
    >
  },
  async setByok(userId, blob, last4) {
    const account = memAccounts.get(userId) ?? EMPTY_ACCOUNT
    memAccounts.set(userId, { ...account, byokCiphertext: blob, byokLast4: last4 })
  },
  async setPlan(userId, plan, monthlyCredits, period) {
    const account = memAccounts.get(userId) ?? EMPTY_ACCOUNT
    memAccounts.set(userId, {
      ...account,
      plan,
      monthlyCredits,
      creditsBalance: monthlyCredits,
      creditsPeriod: period,
    })
  },
}

/* ------------------------------------------------------------------ */
/* Postgres store                                                      */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>
type Sql = Parameters<Parameters<typeof withRlsUserId>[2]>[0]

/**
 * Create the app.users row if missing. Unlike ensureAppUserQuery this targets
 * every unique constraint (DO NOTHING), so a burst of first requests for a
 * new user can't fail on the primary key and slip through unmetered.
 */
function ensureUser(s: Sql, userId: string, email?: string | null) {
  return s`INSERT INTO app.users (id, neon_auth_user_id, email)
           VALUES (${userId}, ${userId}, ${email ?? null})
           ON CONFLICT DO NOTHING`
}
const rowsOf = (result: unknown): Row[] => (Array.isArray(result) ? (result as Row[]) : [])

const sqlBillingStore: BillingStore = {
  async getAccount(userId) {
    const [rows] = await withRlsUserId(requireSql(), userId, (s) => [
      s`SELECT plan, monthly_credits, credits_balance, credits_period, byok_ciphertext, byok_last4
        FROM app.billing_accounts WHERE user_id = ${userId}`,
    ])
    const row = rowsOf(rows)[0]
    if (!row) return null
    return {
      plan: row.plan as AccountPlan,
      monthlyCredits: Number(row.monthly_credits),
      creditsBalance: Number(row.credits_balance),
      creditsPeriod: (row.credits_period as string | null) ?? null,
      byokCiphertext: (row.byok_ciphertext as string | null) ?? null,
      byokLast4: (row.byok_last4 as string | null) ?? null,
    }
  },
  async hasRef(userId, ref) {
    const [rows] = await withRlsUserId(requireSql(), userId, (s) => [
      s`SELECT 1 FROM app.ai_usage_events WHERE user_id = ${userId} AND ref = ${ref} LIMIT 1`,
    ])
    return rowsOf(rows).length > 0
  },
  async takeFree(userId, day, action, limit, email) {
    const [, rows] = await withRlsUserId(requireSql(), userId, (s) => [
      ensureUser(s, userId, email),
      s`INSERT INTO app.ai_usage_daily (user_id, usage_date, action, used)
        SELECT ${userId}, ${day}::date, ${action}, 1 WHERE ${limit}::int > 0
        ON CONFLICT (user_id, usage_date, action) DO UPDATE
          SET used = app.ai_usage_daily.used + 1
          WHERE app.ai_usage_daily.used < ${limit}::int
        RETURNING used`,
    ])
    return rowsOf(rows).length > 0
  },
  async takeCredits(userId, period, cost) {
    const [rows] = await withRlsUserId(requireSql(), userId, (s) => [
      s`UPDATE app.billing_accounts SET
          credits_balance =
            (CASE WHEN credits_period = ${period} THEN credits_balance ELSE monthly_credits END) - ${cost}::int,
          credits_period = ${period},
          updated_at = now()
        WHERE user_id = ${userId}
          AND (CASE WHEN credits_period = ${period} THEN credits_balance ELSE monthly_credits END) >= ${cost}::int
        RETURNING credits_balance`,
    ])
    return rowsOf(rows).length > 0
  },
  async recordEvent(userId, event, email) {
    const [, rows] = await withRlsUserId(requireSql(), userId, (s) => [
      ensureUser(s, userId, email),
      s`INSERT INTO app.ai_usage_events (id, user_id, action, source, credits, ref)
        VALUES (${event.id}, ${userId}, ${event.action}, ${event.source}, ${event.credits}, ${event.ref})
        ON CONFLICT DO NOTHING
        RETURNING id`,
    ])
    return rowsOf(rows).length > 0
  },
  async refund(userId, event, day, period) {
    await withRlsUserId(requireSql(), userId, (s) => [
      ...(event.source === "free"
        ? [
            s`UPDATE app.ai_usage_daily SET used = GREATEST(used - 1, 0)
              WHERE user_id = ${userId} AND usage_date = ${day}::date AND action = ${event.action}`,
          ]
        : []),
      ...(event.source === "credits"
        ? [
            s`UPDATE app.billing_accounts SET credits_balance = credits_balance + ${event.credits}::int, updated_at = now()
              WHERE user_id = ${userId} AND credits_period = ${period}`,
          ]
        : []),
      s`DELETE FROM app.ai_usage_events WHERE user_id = ${userId} AND id = ${event.id}`,
    ])
  },
  async usedOn(userId, day) {
    const [rows] = await withRlsUserId(requireSql(), userId, (s) => [
      s`SELECT action, used FROM app.ai_usage_daily WHERE user_id = ${userId} AND usage_date = ${day}::date`,
    ])
    const used = Object.fromEntries(AI_ACTIONS.map((a) => [a, 0])) as Record<AiAction, number>
    for (const row of rowsOf(rows)) {
      if ((AI_ACTIONS as string[]).includes(String(row.action))) used[row.action as AiAction] = Number(row.used)
    }
    return used
  },
  async setByok(userId, blob, last4) {
    await withRlsUserId(requireSql(), userId, (s) => [
      ensureUser(s, userId),
      s`INSERT INTO app.billing_accounts (user_id, byok_ciphertext, byok_last4, byok_added_at)
        VALUES (${userId}, ${blob}, ${last4}, ${blob ? new Date().toISOString() : null})
        ON CONFLICT (user_id) DO UPDATE SET
          byok_ciphertext = EXCLUDED.byok_ciphertext,
          byok_last4 = EXCLUDED.byok_last4,
          byok_added_at = EXCLUDED.byok_added_at,
          updated_at = now()`,
    ])
  },
  async setPlan(userId, plan, monthlyCredits, period) {
    await withRlsUserId(requireSql(), userId, (s) => [
      ensureUser(s, userId),
      s`INSERT INTO app.billing_accounts (user_id, plan, monthly_credits, credits_balance, credits_period)
        VALUES (${userId}, ${plan}, ${monthlyCredits}, ${monthlyCredits}, ${period})
        ON CONFLICT (user_id) DO UPDATE SET
          plan = EXCLUDED.plan,
          monthly_credits = EXCLUDED.monthly_credits,
          credits_balance = EXCLUDED.credits_balance,
          credits_period = EXCLUDED.credits_period,
          updated_at = now()`,
    ])
  },
}

function store(): BillingStore {
  return isDatabaseConfigured() ? sqlBillingStore : memoryBillingStore
}

function warn(step: string, err: unknown) {
  console.warn(`[billing] ${step} failed; metering open`, err instanceof Error ? err.message : err)
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type AiContext = {
  /** Env for the AI helpers: the organisation's key on a Charter / Fleet seat. */
  env: NodeJS.ProcessEnv
  byok: boolean
}

/** Resolve which OpenRouter key this user's AI calls run on. One read. */
export async function aiContext(userId: string): Promise<AiContext> {
  try {
    const account = await store().getAccount(userId)
    const cipherKey = byokCipherKey()
    // A key only counts on an org-key plan, so a lapsed seat falls back to metering.
    const eligible = account && (ORG_KEY_PLANS as readonly string[]).includes(account.plan)
    const key = eligible && account.byokCiphertext && cipherKey ? decryptKey(account.byokCiphertext, cipherKey) : null
    return { env: envWithKey(key), byok: Boolean(key) }
  } catch (err) {
    warn("aiContext", err)
    return { env: process.env, byok: false }
  }
}

/**
 * Charge one AI action: organisation key → free daily allowance → credits. With a
 * `ref`, the same action is charged at most once (re-posts are free).
 */
export async function chargeAi(options: {
  userId: string
  action: AiAction
  byok: boolean
  email?: string | null
  ref?: string | null
  now?: Date
}): Promise<Charge> {
  const { userId, action, byok } = options
  const now = options.now ?? new Date()
  const day = usageDay(now)
  const period = creditPeriod(now)
  const ref = options.ref ?? null
  const s = store()
  try {
    if (ref && (await s.hasRef(userId, ref))) {
      return { ok: true, id: "repeat", action, source: byok ? "byok" : "free", credits: 0, repeat: true }
    }
    let source: ChargeSource
    let credits = 0
    if (byok) {
      source = "byok"
    } else if (await s.takeFree(userId, day, action, FREE_DAILY_LIMITS[action], options.email)) {
      source = "free"
    } else if (await s.takeCredits(userId, period, CREDIT_COST[action])) {
      source = "credits"
      credits = CREDIT_COST[action]
    } else {
      return { ok: false, action, reason: "limit_reached" }
    }
    const event: UsageEvent = { id: randomUUID(), action, source, credits, ref }
    if (!(await s.recordEvent(userId, event, options.email))) {
      // Lost a race on the same ref: undo our spend, the other request paid.
      await s.refund(userId, { ...event, id: "none" }, day, period)
      return { ok: true, id: "repeat", action, source, credits: 0, repeat: true }
    }
    return { ok: true, id: event.id, action, source, credits, repeat: false }
  } catch (err) {
    warn("chargeAi", err)
    return { ok: true, id: "unmetered", action, source: byok ? "byok" : "free", credits: 0, repeat: false }
  }
}

/** Give back a charge whose model call failed (transcription error, etc.). */
export async function refundAi(userId: string, charge: Charge, now = new Date()): Promise<void> {
  if (!charge.ok || charge.repeat || charge.id === "unmetered") return
  try {
    await store().refund(
      userId,
      { id: charge.id, action: charge.action, source: charge.source, credits: charge.credits, ref: null },
      usageDay(now),
      creditPeriod(now),
    )
  } catch (err) {
    warn("refundAi", err)
  }
}

export type UsageSummary = {
  account_id: string
  plan: AccountPlan
  /** Organisation key on this seat (Charter / Fleet only). */
  byok: { available: boolean; configured: boolean; last4: string | null }
  today: Record<AiAction, { used: number; limit: number }>
  credits: { balance: number; monthly: number }
  cost: Record<AiAction, number>
  resets: { daily: string; credits: string }
}

export async function usageSummary(userId: string, now = new Date()): Promise<UsageSummary> {
  const s = store()
  const [account, used] = await Promise.all([
    s.getAccount(userId).catch((err) => (warn("usageSummary", err), null)),
    s.usedOn(userId, usageDay(now)).catch((err) => (warn("usageSummary", err), null)),
  ])
  const acct = account ?? EMPTY_ACCOUNT
  return {
    account_id: userId,
    plan: acct.plan,
    byok: {
      available: isByokAvailable(),
      configured: Boolean(acct.byokCiphertext) && (ORG_KEY_PLANS as readonly string[]).includes(acct.plan),
      last4: acct.byokLast4,
    },
    today: Object.fromEntries(
      AI_ACTIONS.map((a) => [a, { used: Math.min(used?.[a] ?? 0, FREE_DAILY_LIMITS[a]), limit: FREE_DAILY_LIMITS[a] }]),
    ) as UsageSummary["today"],
    credits: { balance: balanceFor(acct, creditPeriod(now)), monthly: acct.monthlyCredits },
    cost: { ...CREDIT_COST },
    resets: { daily: nextDailyReset(now).toISOString(), credits: nextCreditReset(now).toISOString() },
  }
}

export class ByokUnavailableError extends Error {
  readonly status = 503
  constructor() {
    super("Organisation keys are not configured on this server (BYOK_ENCRYPTION_KEY).")
    this.name = "ByokUnavailableError"
  }
}

/** Admin: store the organisation's verified key (encrypted) on a Charter / Fleet seat. */
export async function saveOrgKey(userId: string, key: string): Promise<{ last4: string }> {
  const cipherKey = byokCipherKey()
  if (!cipherKey) throw new ByokUnavailableError()
  const last4 = keyLast4(key)
  await store().setByok(userId, encryptKey(key, cipherKey), last4)
  return { last4 }
}

/** Admin: drop the organisation key from a seat. True when one was removed. */
export async function clearOrgKey(userId: string): Promise<boolean> {
  if (!(await store().getAccount(userId))?.byokCiphertext) return false
  await store().setByok(userId, null, null)
  return true
}

/** Admin: move an account to a plan and fill this month's credits. */
export async function setAccountPlan(options: {
  userId: string
  plan: AccountPlan
  monthlyCredits?: number
  now?: Date
}): Promise<{ plan: AccountPlan; monthly_credits: number }> {
  const monthly = options.monthlyCredits ?? defaultMonthlyCredits(options.plan, SEAT_CREDITS_PER_MONTH, CREDITS_PER_MONTH)
  await store().setPlan(options.userId, options.plan, monthly, creditPeriod(options.now ?? new Date()))
  return { plan: options.plan, monthly_credits: monthly }
}
