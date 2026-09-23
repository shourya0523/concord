/**
 * Numeric drill API envelopes (plan 2026-09-23-001 P2.8).
 *   GET  /api/drills/next?template=&concept=&difficulty=  → DrillNextResponse
 *   POST /api/drills/attempts                               → DrillAttemptResponse
 */
import { z } from "zod"
import {
  ActivityResultSchema,
  DrillInstanceSchema,
  DrillSolutionSchema,
} from "@ibpe/contracts"

export const DrillNextResponseSchema = z.object({
  drill: DrillInstanceSchema.nullable(),
  note: z.string().optional(),
})
export type DrillNextResponse = z.infer<typeof DrillNextResponseSchema>

export const DrillAttemptRequestSchema = z.object({
  drill_id: z.string().min(1),
  response_text: z.string().trim().max(500),
  time_spent_ms: z.number().int().nonnegative().nullable().optional(),
})
export type DrillAttemptRequest = z.infer<typeof DrillAttemptRequestSchema>

export const DrillAttemptResponseSchema = z.object({
  drill_id: z.string(),
  correct: z.boolean(),
  score: z.number().min(0).max(1),
  found: z.number().nullable(),
  solution: DrillSolutionSchema,
  activity: ActivityResultSchema.nullable().optional(),
  source: z.enum(["published", "stub"]),
})
export type DrillAttemptResponse = z.infer<typeof DrillAttemptResponseSchema>

/** GET /api/drills/templates — the drill catalogue plus this user's record per template. */
export const DrillTemplateSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  concept_id: z.string().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  description: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  attempts: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  last_attempt_at: z.string().nullable(),
})
export type DrillTemplateSummary = z.infer<typeof DrillTemplateSummarySchema>

export const DrillTemplatesResponseSchema = z.object({
  items: z.array(DrillTemplateSummarySchema),
  source: z.enum(["published", "stub"]),
})
export type DrillTemplatesResponse = z.infer<typeof DrillTemplatesResponseSchema>

export const DrillNextQuerySchema = z.object({
  template: z.string().regex(/^[a-z0-9_]+$/).optional(),
  concept: z.string().min(1).max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
})
export type DrillNextQuery = z.infer<typeof DrillNextQuerySchema>
