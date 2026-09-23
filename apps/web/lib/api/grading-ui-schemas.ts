/**
 * API contracts for the grading-UI track (plan 2026-09-23-001 P5.8, P7.1):
 * the simulator after-action report and voice transcription.
 */
import { z } from "zod"
import { ActivityResultSchema } from "@ibpe/contracts"

import { AttemptGradeResponseSchema } from "@/lib/api/schemas"

/* ------------------------------------------------------------------ */
/* POST /api/transcribe                                                */
/* ------------------------------------------------------------------ */

export const TranscribeResponseSchema = z.object({
  transcript: z.string(),
  model: z.string(),
  bytes: z.number().int().nonnegative(),
  media_type: z.string(),
})
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>

/* ------------------------------------------------------------------ */
/* POST /api/practice/sessions/[id]/report                             */
/* ------------------------------------------------------------------ */

export const MockReportStageInputSchema = z.object({
  stage_id: z.string().min(1).max(64),
  label: z.string().max(120).optional(),
  question_id: z.string().max(200).nullable().optional(),
  topic: z.string().max(80).nullable().optional(),
  /** Client-held grades — used only when the database is not configured. */
  grades: z.array(AttemptGradeResponseSchema).max(4).default([]),
})
export type MockReportStageInput = z.infer<typeof MockReportStageInputSchema>

export const MockReportRequestSchema = z.object({
  stages: z.array(MockReportStageInputSchema).max(8).default([]),
  firm_name: z.string().max(120).nullable().optional(),
  /** Record the mock_complete learning activity (default true). */
  complete: z.boolean().default(true),
})
export type MockReportRequest = z.infer<typeof MockReportRequestSchema>

const TopicScoreSchema = z.object({
  topic: z.string(),
  label: z.string(),
  score: z.number().min(0).max(1),
})

export const MockReportSchema = z.object({
  session_id: z.string(),
  overall_score: z.number().min(0).max(1).nullable(),
  graded_stages: z.number().int().nonnegative(),
  stages: z.array(
    z.object({
      stage_id: z.string(),
      label: z.string(),
      question_id: z.string().nullable(),
      topic: z.string().nullable(),
      score: z.number().min(0).max(1).nullable(),
      score_source: z.string().nullable(),
      feedback: z.string().nullable(),
      weak_topics: z.array(z.string()),
      follow_up_score: z.number().min(0).max(1).nullable(),
    }),
  ),
  strongest_topics: z.array(TopicScoreSchema),
  weakest_topics: z.array(TopicScoreSchema),
  recommended_concepts: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      topic: z.string().nullable(),
      reason: z.string(),
      citation_ids: z.array(z.string()),
    }),
  ),
  summary: z.string(),
  summary_source: z.enum(["deterministic", "gemini"]),
  /** Deterministic summary, kept when a Gemini paragraph replaces `summary`. */
  deterministic_summary: z.string(),
  citations: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["teaching_answer", "heat_topic"]),
      label: z.string().optional(),
    }),
  ),
  attempts_source: z.enum(["database", "request", "none"]),
})
export type MockReportPayload = z.infer<typeof MockReportSchema>

export const MockReportResponseSchema = z.object({
  report: MockReportSchema,
  activity: ActivityResultSchema.nullable().optional(),
  note: z.string().optional(),
})
export type MockReportResponse = z.infer<typeof MockReportResponseSchema>
