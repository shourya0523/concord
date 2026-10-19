/**
 * AI usage metering types and periods (DESIGN.md §17.4, migration 064). Pure;
 * lib/billing/meter.ts applies the order below with atomic store steps.
 *
 * Every model-backed action is charged in order:
 *   1. the user's own OpenRouter key (byok) — never limited
 *   2. the free daily allowance (UTC day)
 *   3. monthly credits (refilled lazily on the first charge of a UTC month)
 * and refused when all three are exhausted.
 */
import { CREDIT_COST } from "./plans"

export type AiAction = keyof typeof CREDIT_COST
export const AI_ACTIONS = Object.keys(CREDIT_COST) as AiAction[]

export type ChargeSource = "byok" | "free" | "credits"

/** Stored plan (billing_accounts.plan). BYOK is a key on any plan, not a plan row. */
export type AccountPlan = "free" | "credits" | "team" | "custom"
export const ACCOUNT_PLANS: readonly AccountPlan[] = ["free", "credits", "team", "custom"]

export type CreditState = {
  monthlyCredits: number
  creditsBalance: number
  creditsPeriod: string | null
}

export type Charge =
  | { ok: true; id: string; action: AiAction; source: ChargeSource; credits: number; repeat: boolean }
  | { ok: false; action: AiAction; reason: "limit_reached" }

export function isAiAction(value: unknown): value is AiAction {
  return typeof value === "string" && value in CREDIT_COST
}

export function isAccountPlan(value: unknown): value is AccountPlan {
  return typeof value === "string" && (ACCOUNT_PLANS as readonly string[]).includes(value)
}

/** UTC calendar day, "2026-10-19". Free limits reset at 00:00 UTC. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** UTC month, "2026-10". Credits refill on the first charge of a new month. */
export function creditPeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}

export function nextDailyReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

export function nextCreditReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/** Balance as of `period`: a stale period means this month's refill hasn't happened yet. */
export function balanceFor(state: CreditState, period: string): number {
  return state.creditsPeriod === period ? state.creditsBalance : state.monthlyCredits
}

/** Default monthly credits when an admin moves an account to a plan. */
export function defaultMonthlyCredits(plan: AccountPlan, seatCredits: number, packCredits: number): number {
  if (plan === "credits") return packCredits
  if (plan === "team") return seatCredits
  return 0
}

/** User-facing copy for a refused charge. */
export function limitMessage(action: AiAction): string {
  const what = action === "grade" ? "AI grades" : action === "coaching" ? "coaching reports" : "voice answers"
  return `You've used today's free ${what}. Credits or your own OpenRouter key lift the cap (Settings → Plan).`
}
