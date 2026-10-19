/**
 * Admin review API contracts (plan P2.5) — /api/admin/proposals.
 */
import { z } from "zod"

import { PROPOSAL_STATUSES, PROPOSAL_TARGET_KINDS } from "@/lib/admin/proposals"

export const ProposalListQuerySchema = z.object({
  status: z.enum([...PROPOSAL_STATUSES, "all"]).default("pending"),
  target_kind: z.enum(PROPOSAL_TARGET_KINDS).optional(),
  q: z.string().trim().max(120).optional(),
  min_confidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ProposalListQuery = z.infer<typeof ProposalListQuerySchema>

export const ProposalDiffEntrySchema = z.object({
  path: z.string(),
  change: z.enum(["added", "removed", "changed"]),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
})

export const ProposalItemSchema = z.object({
  id: z.string(),
  target_kind: z.string(),
  target_id: z.string(),
  field: z.string(),
  proposal_json: z.unknown(),
  current_json: z.unknown(),
  /** Live value read from the canonical table when current_json was not stored. */
  current_source: z.enum(["stored", "live", "none"]),
  model: z.string().nullable(),
  prompt_version: z.string().nullable(),
  confidence: z.number().nullable(),
  status: z.string(),
  auto_approved: z.boolean(),
  reviewer: z.string().nullable(),
  review_note: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  review_task: z
    .object({ id: z.string(), status: z.string(), assignee: z.string().nullable() })
    .nullable(),
  diff: z.array(ProposalDiffEntrySchema),
  /** null when the proposal is applicable; otherwise why approve would fail. */
  plan_error: z.string().nullable(),
})
export type ProposalItem = z.infer<typeof ProposalItemSchema>

export const ProposalListResponseSchema = z.object({
  items: z.array(ProposalItemSchema),
  total: z.number().int().nonnegative(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  limit: z.number().int(),
  offset: z.number().int(),
  source: z.enum(["published", "empty"]),
  note: z.string().optional(),
})
export type ProposalListResponse = z.infer<typeof ProposalListResponseSchema>

export const ProposalDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    id: z.string().min(1),
    /** Optional reviewer edit applied instead of the stored proposal. */
    proposal_json: z.unknown().optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    id: z.string().min(1),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().min(1),
    proposal_json: z.unknown(),
    note: z.string().trim().max(2000).optional(),
  }),
])
export type ProposalDecision = z.infer<typeof ProposalDecisionSchema>

export const ProposalDecisionResponseSchema = z.object({
  item: ProposalItemSchema,
  applied: z.boolean(),
  message: z.string(),
})
export type ProposalDecisionResponse = z.infer<typeof ProposalDecisionResponseSchema>
