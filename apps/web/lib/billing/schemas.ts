/** Wire schemas for /api/billing/* and /api/admin/billing. */
import { z } from "zod"

import { ACCOUNT_PLANS, AI_ACTIONS } from "./meter-core"
import { ORG_KEY_PLANS } from "./plans"

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

export const AdminSetPlanSchema = z
  .object({
    /** One account, or every seat of a team at once. */
    user_id: z.string().trim().min(1).max(200).optional(),
    user_ids: z.array(z.string().trim().min(1).max(200)).min(1).max(500).optional(),
    plan: z.enum(ACCOUNT_PLANS as [string, ...string[]]),
    monthly_credits: z.number().int().min(0).max(1_000_000).optional(),
    /** Team / Custom only: the organisation's OpenRouter key for these seats. */
    openrouter_key: z.string().trim().min(1).max(256).optional(),
    /** Drop the organisation key from these seats. */
    remove_org_key: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.user_id) !== Boolean(v.user_ids), {
    message: "Send user_id or user_ids",
    path: ["user_id"],
  })
  .refine((v) => !v.openrouter_key || (ORG_KEY_PLANS as readonly string[]).includes(v.plan), {
    message: "openrouter_key is only for team or custom plans (Charter / Fleet)",
    path: ["openrouter_key"],
  })
  .refine((v) => !(v.openrouter_key && v.remove_org_key), {
    message: "Send openrouter_key or remove_org_key, not both",
    path: ["remove_org_key"],
  })
