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
