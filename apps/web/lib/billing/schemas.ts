/** Wire schemas for /api/billing/* and /api/admin/billing. */
import { z } from "zod"

import { ACCOUNT_PLANS, AI_ACTIONS } from "./meter-core"

const actionUsage = z.object({ used: z.number().int().min(0), limit: z.number().int().min(0) })

export const UsageSummarySchema = z.object({
  account_id: z.string(),
  plan: z.enum(ACCOUNT_PLANS as [string, ...string[]]),
  byok: z.object({ available: z.boolean(), configured: z.boolean(), last4: z.string().nullable() }),
  today: z.object(Object.fromEntries(AI_ACTIONS.map((a) => [a, actionUsage])) as Record<string, typeof actionUsage>),
  credits: z.object({ balance: z.number().int(), monthly: z.number().int() }),
  cost: z.record(z.number().int()),
  resets: z.object({ daily: z.string(), credits: z.string() }),
})

export const ByokSaveSchema = z.object({
  key: z.string().trim().min(1, "Paste your OpenRouter key").max(256),
})

export const AdminSetPlanSchema = z.object({
  user_id: z.string().trim().min(1).max(200),
  plan: z.enum(ACCOUNT_PLANS as [string, ...string[]]),
  monthly_credits: z.number().int().min(0).max(1_000_000).optional(),
})
