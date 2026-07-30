/**
 * API response envelopes composed from @ibpe/contracts entity schemas.
 * Local to apps/web (architecture owns packages/contracts).
 */
import { z } from "zod";
import {
  BankQuestionSchema,
  CanonicalQuestionSchema,
  MasterySchema,
  PracticeSessionSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  TopicHeatSchema,
} from "@ibpe/contracts";

export const DataSourceSchema = z.enum([
  "published",
  "bank_fallback",
  "stub",
  "empty",
]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const QuestionListResponseSchema = z.object({
  items: z.array(CanonicalQuestionSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  source: DataSourceSchema,
});
export type QuestionListResponse = z.infer<typeof QuestionListResponseSchema>;

export const QuestionDetailResponseSchema = z.object({
  question: CanonicalQuestionSchema,
  /** Glassdoor firm-signal rows linked by wording / legacy id when available. */
  bank_signals: z.array(BankQuestionSchema).default([]),
  source: DataSourceSchema,
});
export type QuestionDetailResponse = z.infer<typeof QuestionDetailResponseSchema>;

export const FirmHeatResponseSchema = z.object({
  firm_id: z.string(),
  topics: z.array(TopicHeatSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type FirmHeatResponse = z.infer<typeof FirmHeatResponseSchema>;

export const CreatePracticeSessionRequestSchema = z.object({
  mode: z
    .enum(["company", "concept", "adaptive_weak", "pseudo_rag"])
    .default("adaptive_weak"),
  learning_mode: z.enum(["company_prep", "concept_learn"]).optional(),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  question_ids: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(50).default(10),
});
export type CreatePracticeSessionRequest = z.infer<
  typeof CreatePracticeSessionRequestSchema
>;

export const PracticeSessionResponseSchema = z.object({
  session: PracticeSessionSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type PracticeSessionResponse = z.infer<typeof PracticeSessionResponseSchema>;

export const MasteryListResponseSchema = z.object({
  items: z.array(MasterySchema),
  source: DataSourceSchema,
});
export type MasteryListResponse = z.infer<typeof MasteryListResponseSchema>;

export const NoteSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  question_id: z.string().nullable().optional(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const NotesListResponseSchema = z.object({
  items: z.array(NoteSchema),
  source: DataSourceSchema,
});
export type NotesListResponse = z.infer<typeof NotesListResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("ibpe-web"),
  auth: z.enum(["configured", "stub"]),
  database: z.enum(["configured", "unavailable"]),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export { SearchRequestSchema, SearchResponseSchema };
