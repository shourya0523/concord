/**
 * API response envelopes composed from @ibpe/contracts entity schemas.
 * Local to apps/web (architecture owns packages/contracts).
 */
import { z } from "zod"
import {
  AttemptSchema,
  BankQuestionSchema,
  BookmarkSchema,
  CanonicalQuestionSchema,
  CollectionItemSchema,
  CollectionSchema,
  ConceptSchema,
  DiagramRefSchema,
  LearningModuleCheckpointSchema,
  LearningModuleSchema,
  LearningResourceSchema,
  MasterySchema,
  ModuleProgressSchema,
  PracticeSessionModeEnum,
  PracticeSessionSchema,
  PseudoRagPackSchema,
  QuestionStudyPayloadSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  StudyPlanItemSchema,
  StudyPlanSchema,
  TargetCompanySetSchema,
  TopicHeatSchema,
} from "@ibpe/contracts"

export const DataSourceSchema = z.enum([
  "published",
  "bank_fallback",
  "stub",
  "empty",
])
export type DataSource = z.infer<typeof DataSourceSchema>

export const QuestionListResponseSchema = z.object({
  items: z.array(CanonicalQuestionSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  source: DataSourceSchema,
})
export type QuestionListResponse = z.infer<typeof QuestionListResponseSchema>

/** Legacy layered study block kept for clients; prefer study_payload. */
export const LegacyStudyBlockSchema = z.object({
  answer_id: z.string().nullable(),
  direct_answer: z.string().nullable(),
  interview_ready_explanation: z.string().nullable(),
  step_by_step: z.array(z.string()).default([]),
  diagram_refs: z.array(DiagramRefSchema).default([]),
  /** Resolved diagram for the inline reveal slot (body included). */
  diagram_asset: z
    .object({
      id: z.string(),
      title: z.string(),
      body: z.string(),
      a11y_fallback: z.string().nullable(),
    })
    .nullable()
    .default(null),
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
      })
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

export const QuestionDetailResponseSchema = z.object({
  question: CanonicalQuestionSchema,
  bank_signals: z.array(BankQuestionSchema).default([]),
  study: LegacyStudyBlockSchema.optional(),
  study_payload: QuestionStudyPayloadSchema.optional(),
  source: DataSourceSchema,
})
export type QuestionDetailResponse = z.infer<
  typeof QuestionDetailResponseSchema
>

export const FirmHeatResponseSchema = z.object({
  firm_id: z.string(),
  topics: z.array(TopicHeatSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type FirmHeatResponse = z.infer<typeof FirmHeatResponseSchema>

export const CreatePracticeSessionRequestSchema = z.object({
  mode: PracticeSessionModeEnum.catch("adaptive_weak"),
  learning_mode: z.enum(["company_prep", "concept_learn"]).optional(),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  question_ids: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(50).default(10),
})
export type CreatePracticeSessionRequest = z.infer<
  typeof CreatePracticeSessionRequestSchema
>

export const PracticeSessionResponseSchema = z.object({
  session: PracticeSessionSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type PracticeSessionResponse = z.infer<
  typeof PracticeSessionResponseSchema
>

export const MasteryListResponseSchema = z.object({
  items: z.array(MasterySchema),
  source: DataSourceSchema,
})
export type MasteryListResponse = z.infer<typeof MasteryListResponseSchema>

export const TargetCompanySetResponseSchema = z.object({
  target_set: TargetCompanySetSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type TargetCompanySetResponse = z.infer<
  typeof TargetCompanySetResponseSchema
>

/** HTTP body — server injects user_id from session. */
export const UpdateTargetCompanySetRequestSchema = z.object({
  firm_ids: z.array(z.string().min(1)).min(1),
  primary_firm_id: z.string().nullable().optional(),
})
export type UpdateTargetCompanySetRequest = z.infer<
  typeof UpdateTargetCompanySetRequestSchema
>

export const LearningModuleListItemSchema = LearningModuleSchema.extend({
  progress: ModuleProgressSchema.optional(),
})
export type LearningModuleListItem = z.infer<
  typeof LearningModuleListItemSchema
>

export const LearningModuleListResponseSchema = z.object({
  items: z.array(LearningModuleListItemSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type LearningModuleListResponse = z.infer<
  typeof LearningModuleListResponseSchema
>

export const LearningModuleDetailResponseSchema = z.object({
  module: LearningModuleListItemSchema,
  checkpoints: z.array(LearningModuleCheckpointSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type LearningModuleDetailResponse = z.infer<
  typeof LearningModuleDetailResponseSchema
>

export const DiagramAssetSchema = z.object({
  ref: DiagramRefSchema,
  title: z.string(),
  /** Mermaid (or interactive-json) definition body. */
  body: z.string(),
})
export type DiagramAsset = z.infer<typeof DiagramAssetSchema>

export const ConceptWithAssetsSchema = z.object({
  concept: ConceptSchema,
  /** Topic slug mapped from the concept (heat/drill bridge). */
  topic: z.string().nullable().default(null),
  diagram_refs: z.array(DiagramRefSchema).default([]),
  diagrams: z.array(DiagramAssetSchema).default([]),
  resources: z.array(LearningResourceSchema).default([]),
})
export type ConceptWithAssets = z.infer<typeof ConceptWithAssetsSchema>

export const ConceptListResponseSchema = z.object({
  items: z.array(ConceptWithAssetsSchema),
  source: DataSourceSchema,
})
export type ConceptListResponse = z.infer<typeof ConceptListResponseSchema>

export const ConceptDetailResponseSchema = z.object({
  item: ConceptWithAssetsSchema,
  source: DataSourceSchema,
})
export type ConceptDetailResponse = z.infer<typeof ConceptDetailResponseSchema>

export const PrepRagRequestSchema = z.object({
  firm_ids: z.array(z.string().min(1)).min(1),
  query: z.string().trim().optional(),
  weak_topics: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(20).default(8),
})
export type PrepRagRequest = z.infer<typeof PrepRagRequestSchema>

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
          })
        )
        .default([]),
      weak_topic_hit: z.boolean(),
      reasons: z.array(z.string()),
    })
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
    })
  ),
  source: DataSourceSchema,
  brief: z.string(),
  brief_source: z.enum(["gemini", "template"]),
  brief_citations: z
    .array(
      z.object({
        item_id: z.string(),
        label: z.string(),
      })
    )
    .default([]),
  notes: z.array(z.string()).default([]),
})
export type PrepRagResponse = z.infer<typeof PrepRagResponseSchema>

export const HeatFirmMetaSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
})

export const MultiFirmHeatResponseSchema = z.object({
  firm_ids: z.array(z.string()),
  firms: z.array(HeatFirmMetaSchema).default([]),
  topics: z.array(TopicHeatSchema),
  by_topic: z.record(z.string(), z.number()).default({}),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type MultiFirmHeatResponse = z.infer<typeof MultiFirmHeatResponseSchema>

export const CreateAttemptRequestSchema = z.object({
  canonical_question_id: z.string().optional(),
  question_id: z.string().optional(),
  response_text: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  correct: z.boolean().nullable().optional(),
  time_spent_ms: z.number().int().nonnegative().nullable().optional(),
})
export type CreateAttemptRequest = z.infer<typeof CreateAttemptRequestSchema>

export const AttemptGradeResponseSchema = z.object({
  score_source: z.enum(["self", "llm", "deterministic"]),
  score: z.number().min(0).max(1),
  feedback: z.string().optional(),
  weak_topics: z.array(z.string()).default([]),
  citations: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["teaching_answer", "heat_topic", "occurrence"]),
        label: z.string().optional(),
      }),
    )
    .default([]),
  rubric: z.record(z.unknown()).nullable().optional(),
})
export type AttemptGradeResponse = z.infer<typeof AttemptGradeResponseSchema>

export const AttemptResponseSchema = z.object({
  attempt: AttemptSchema,
  mastery: MasterySchema.optional(),
  grade: AttemptGradeResponseSchema.optional(),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type AttemptResponse = z.infer<typeof AttemptResponseSchema>

export const StudyPlanResponseSchema = z.object({
  plan: StudyPlanSchema,
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type StudyPlanResponse = z.infer<typeof StudyPlanResponseSchema>

export const UpdateStudyPlanRequestSchema = z.object({
  title: z.string().trim().min(1).default("Interview study plan"),
  learning_mode: z
    .enum(["company_prep", "concept_learn"])
    .default("company_prep"),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  weak_topic_ids: z.array(z.string()).default([]),
  items: z.array(StudyPlanItemSchema).default([]),
})
export type UpdateStudyPlanRequest = z.infer<
  typeof UpdateStudyPlanRequestSchema
>

export const BookmarkListResponseSchema = z.object({
  items: z.array(BookmarkSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type BookmarkListResponse = z.infer<typeof BookmarkListResponseSchema>

export const CreateBookmarkRequestSchema = z.object({
  entity_kind: BookmarkSchema.shape.entity_kind,
  entity_id: z.string().min(1),
  firm_ids: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
})
export type CreateBookmarkRequest = z.infer<typeof CreateBookmarkRequestSchema>

export const CollectionWithItemsSchema = CollectionSchema.extend({
  items: z.array(CollectionItemSchema).default([]),
})
export type CollectionWithItems = z.infer<typeof CollectionWithItemsSchema>

export const CollectionListResponseSchema = z.object({
  items: z.array(CollectionWithItemsSchema),
  source: DataSourceSchema,
  note: z.string().optional(),
})
export type CollectionListResponse = z.infer<
  typeof CollectionListResponseSchema
>

export const CreateCollectionRequestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        entity_kind: CollectionItemSchema.shape.entity_kind,
        entity_id: z.string().min(1),
        position: z.number().int().nonnegative().optional(),
        note: z.string().nullable().optional(),
      })
    )
    .default([]),
})
export type CreateCollectionRequest = z.infer<
  typeof CreateCollectionRequestSchema
>

export const NoteSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  question_id: z.string().nullable().optional(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const NotesListResponseSchema = z.object({
  items: z.array(NoteSchema),
  source: DataSourceSchema,
})
export type NotesListResponse = z.infer<typeof NotesListResponseSchema>

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("ibpe-web"),
  auth: z.enum(["configured", "stub"]),
  database: z.enum(["configured", "unavailable"]),
  timestamp: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export {
  BookmarkSchema,
  CollectionItemSchema,
  CollectionSchema,
  LearningModuleCheckpointSchema,
  LearningModuleSchema,
  ModuleProgressSchema,
  PracticeSessionSchema,
  QuestionStudyPayloadSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  StudyPlanSchema,
  TargetCompanySetSchema,
}
