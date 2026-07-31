/**
 * API response envelopes composed from @ibpe/contracts entity schemas.
 * Local to apps/web (architecture owns packages/contracts).
 */
import { z } from "zod";
import {
  AttemptSchema,
  BankQuestionSchema,
  CanonicalQuestionSchema,
  ConceptSchema,
  DiagramRefSchema,
  LearningResourceSchema,
  MasterySchema,
  PseudoRagPackSchema,
  PracticeSessionSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  StudyPlanSchema,
  TargetCompanySetSchema,
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
  study: z
    .object({
      answer_id: z.string().nullable(),
      direct_answer: z.string().nullable(),
      interview_ready_explanation: z.string().nullable(),
      step_by_step: z.array(z.string()).default([]),
      diagram_refs: z.array(DiagramRefSchema).default([]),
      formulae: z.array(z.string()).default([]),
      assumptions: z.array(z.string()).default([]),
      common_mistakes: z.array(z.string()).default([]),
      follow_ups: z.array(z.string()).default([]),
      related_concepts: z.array(ConceptSchema).default([]),
      resources: z.array(LearningResourceSchema).default([]),
      sources: z
        .array(
          z.object({
            label: z.string().optional(),
            provenance: z.string(),
            url: z.string().url().optional(),
          }),
        )
        .default([]),
      validation: z
        .object({
          provenance_type: z.string().nullable(),
          confidence: z.number().min(0).max(1).nullable(),
          difficulty: z.string().nullable(),
        })
        .nullable(),
    })
    .optional(),
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
    // TODO(contracts): switch back to PracticeSessionModeEnum when simulator lands.
    .enum(["company", "concept", "adaptive_weak", "pseudo_rag", "simulator"])
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

// TODO(contracts): remove this local extension when @ibpe/contracts includes simulator.
export const LocalPracticeSessionSchema = PracticeSessionSchema.extend({
  mode: z.enum(["company", "concept", "adaptive_weak", "pseudo_rag", "simulator"]),
});
export type LocalPracticeSession = z.infer<typeof LocalPracticeSessionSchema>;

export const PracticeSessionResponseSchema = z.object({
  session: LocalPracticeSessionSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type PracticeSessionResponse = z.infer<typeof PracticeSessionResponseSchema>;

export const MasteryListResponseSchema = z.object({
  items: z.array(MasterySchema),
  source: DataSourceSchema,
});
export type MasteryListResponse = z.infer<typeof MasteryListResponseSchema>;

export const TargetCompanySetResponseSchema = z.object({
  target_set: TargetCompanySetSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type TargetCompanySetResponse = z.infer<typeof TargetCompanySetResponseSchema>;

export const UpdateTargetCompanySetRequestSchema = z.object({
  firm_ids: z.array(z.string().min(1)).min(1),
  primary_firm_id: z.string().nullable().optional(),
});
export type UpdateTargetCompanySetRequest = z.infer<
  typeof UpdateTargetCompanySetRequestSchema
>;

export const LearningModuleCheckpointSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: z.enum(["read", "diagram", "drill", "quiz", "simulation"]).default("read"),
  concept_ids: z.array(z.string()).default([]),
  question_ids: z.array(z.string()).default([]),
  resource_ids: z.array(z.string()).default([]),
  estimated_minutes: z.number().int().positive().default(10),
  order: z.number().int().nonnegative(),
});
export type LearningModuleCheckpoint = z.infer<
  typeof LearningModuleCheckpointSchema
>;

export const LearningModuleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  learning_mode: z.enum(["company_prep", "concept_learn"]),
  track: z.enum(["IB", "PE", "both"]).default("both"),
  publishable: z.boolean().default(true),
  checkpoint_count: z.number().int().nonnegative(),
  estimated_minutes: z.number().int().positive(),
  concept_ids: z.array(z.string()).default([]),
  firm_ids: z.array(z.string()).default([]),
  progress: z
    .object({
      completed_checkpoint_ids: z.array(z.string()).default([]),
      percent_complete: z.number().min(0).max(1).default(0),
      last_checkpoint_id: z.string().nullable().optional(),
    })
    .optional(),
});
export type LearningModule = z.infer<typeof LearningModuleSchema>;

export const LearningModuleListResponseSchema = z.object({
  items: z.array(LearningModuleSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type LearningModuleListResponse = z.infer<
  typeof LearningModuleListResponseSchema
>;

export const LearningModuleDetailResponseSchema = z.object({
  module: LearningModuleSchema,
  checkpoints: z.array(LearningModuleCheckpointSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type LearningModuleDetailResponse = z.infer<
  typeof LearningModuleDetailResponseSchema
>;

export const ConceptWithAssetsSchema = z.object({
  concept: ConceptSchema,
  diagram_refs: z.array(DiagramRefSchema).default([]),
  resources: z.array(LearningResourceSchema).default([]),
});
export type ConceptWithAssets = z.infer<typeof ConceptWithAssetsSchema>;

export const ConceptListResponseSchema = z.object({
  items: z.array(ConceptWithAssetsSchema),
  source: DataSourceSchema,
});
export type ConceptListResponse = z.infer<typeof ConceptListResponseSchema>;

export const ConceptDetailResponseSchema = z.object({
  item: ConceptWithAssetsSchema,
  source: DataSourceSchema,
});
export type ConceptDetailResponse = z.infer<typeof ConceptDetailResponseSchema>;

export const PrepRagRequestSchema = z.object({
  firm_ids: z.array(z.string().min(1)).min(1),
  query: z.string().trim().optional(),
  weak_topics: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(20).default(8),
});
export type PrepRagRequest = z.infer<typeof PrepRagRequestSchema>;

export const PrepRagResponseSchema = z.object({
  pack: PseudoRagPackSchema,
  explanations: z.array(
    z.object({
      item_id: z.string(),
      topic: z.string().nullable(),
      heat_hits: z
        .array(
          z.object({
            firm_id: z.string(),
            topic_id: z.string(),
            intensity: z.number().min(0).max(1),
          }),
        )
        .default([]),
      weak_topic_hit: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  hits: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      snippet: z.string().optional(),
      score: z.number(),
      provenance: z.string().optional(),
      firm_ids: z.array(z.string()).default([]),
      concept_ids: z.array(z.string()).default([]),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  source: DataSourceSchema,
  notes: z.array(z.string()).default([]),
});
export type PrepRagResponse = z.infer<typeof PrepRagResponseSchema>;

export const MultiFirmHeatResponseSchema = z.object({
  firm_ids: z.array(z.string()),
  topics: z.array(TopicHeatSchema),
  by_topic: z.record(z.string(), z.number()).default({}),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type MultiFirmHeatResponse = z.infer<typeof MultiFirmHeatResponseSchema>;

export const CreateAttemptRequestSchema = z.object({
  canonical_question_id: z.string().optional(),
  question_id: z.string().optional(),
  response_text: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  correct: z.boolean().nullable().optional(),
  time_spent_ms: z.number().int().nonnegative().nullable().optional(),
});
export type CreateAttemptRequest = z.infer<typeof CreateAttemptRequestSchema>;

export const AttemptResponseSchema = z.object({
  attempt: AttemptSchema,
  mastery: MasterySchema.optional(),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

// TODO(contracts): StudyPlan item kind should include modules/checkpoints.
export const LocalStudyPlanSchema = StudyPlanSchema.extend({
  items: z
    .array(
      z.object({
        kind: z.enum([
          "module",
          "module_checkpoint",
          "question",
          "concept",
          "resource",
          "diagram",
        ]),
        id: z.string(),
        due_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
});
export type LocalStudyPlan = z.infer<typeof LocalStudyPlanSchema>;

export const StudyPlanResponseSchema = z.object({
  plan: LocalStudyPlanSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type StudyPlanResponse = z.infer<typeof StudyPlanResponseSchema>;

export const UpdateStudyPlanRequestSchema = z.object({
  title: z.string().trim().min(1).default("Interview study plan"),
  learning_mode: z.enum(["company_prep", "concept_learn"]).default("company_prep"),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  weak_topic_ids: z.array(z.string()).default([]),
  items: LocalStudyPlanSchema.shape.items.default([]),
});
export type UpdateStudyPlanRequest = z.infer<typeof UpdateStudyPlanRequestSchema>;

export const BookmarkSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  item_type: z.enum(["question", "concept", "resource", "diagram", "module"]),
  item_id: z.string(),
  created_at: z.string(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const BookmarkListResponseSchema = z.object({
  items: z.array(BookmarkSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type BookmarkListResponse = z.infer<typeof BookmarkListResponseSchema>;

export const CreateBookmarkRequestSchema = z.object({
  item_type: BookmarkSchema.shape.item_type,
  item_id: z.string().min(1),
});
export type CreateBookmarkRequest = z.infer<typeof CreateBookmarkRequestSchema>;

export const CollectionItemSchema = z.object({
  item_type: BookmarkSchema.shape.item_type,
  item_id: z.string(),
  added_at: z.string(),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

export const CollectionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  items: z.array(CollectionItemSchema).default([]),
  created_at: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionListResponseSchema = z.object({
  items: z.array(CollectionSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
});
export type CollectionListResponse = z.infer<typeof CollectionListResponseSchema>;

export const CreateCollectionRequestSchema = z.object({
  name: z.string().trim().min(1),
  items: z.array(CollectionItemSchema.omit({ added_at: true })).default([]),
});
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

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
