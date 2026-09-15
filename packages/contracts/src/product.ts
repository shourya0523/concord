/**
 * Product-facing entities: firms, roles, practice, search, learning packs.
 */
import { z } from "zod";
import {
  AnswerProvenanceEnum,
  BankTrackEnum,
  DomainEnum,
  LearningModeEnum,
  MasteryLevelEnum,
  PracticeSessionModeEnum,
  ProvenanceEnum,
  ValidationStatusEnum,
} from "./enums.js";

/** Canonical firm for company prep rooms + occurrence joins. */
export const FirmSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  aliases: z.array(z.string()).default([]),
  tracks: z.array(BankTrackEnum.or(z.string())).default([]),
  parent_org: z.string().nullable().optional(),
  glassdoor_employer_id: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  geographies: z.array(z.string()).default([]),
  strategies: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Firm = z.infer<typeof FirmSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  track: BankTrackEnum.or(z.string()).nullable().optional(),
  domain: DomainEnum.nullable().optional(),
  pe_relevance: z.string().nullable().optional(),
});
export type Role = z.infer<typeof RoleSchema>;

export const TargetCompanySetSchema = z.object({
  user_id: z.string(),
  firm_ids: z.array(z.string()).min(1),
  primary_firm_id: z.string().nullable().optional(),
  updated_at: z.string(),
});
export type TargetCompanySet = z.infer<typeof TargetCompanySetSchema>;

export const GetTargetCompanySetRequestSchema = z.object({
  user_id: z.string(),
});
export type GetTargetCompanySetRequest = z.infer<
  typeof GetTargetCompanySetRequestSchema
>;

export const GetTargetCompanySetResponseSchema = z.object({
  target_company_set: TargetCompanySetSchema.nullable(),
});
export type GetTargetCompanySetResponse = z.infer<
  typeof GetTargetCompanySetResponseSchema
>;

export const PutTargetCompanySetRequestSchema = TargetCompanySetSchema.pick({
  user_id: true,
  firm_ids: true,
  primary_firm_id: true,
});
export type PutTargetCompanySetRequest = z.infer<
  typeof PutTargetCompanySetRequestSchema
>;

export const PutTargetCompanySetResponseSchema = z.object({
  target_company_set: TargetCompanySetSchema,
});
export type PutTargetCompanySetResponse = z.infer<
  typeof PutTargetCompanySetResponseSchema
>;

export const TopicHeatSchema = z.object({
  firm_id: z.string(),
  topic_id: z.string(),
  intensity: z.number().min(0).max(1),
  sample_size: z.number().int().nonnegative(),
  window: z.string().optional(),
  method: z
    .enum(["glassdoor_occurrence", "enriched", "editorial"])
    .default("glassdoor_occurrence"),
});
export type TopicHeat = z.infer<typeof TopicHeatSchema>;

export const ConceptSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  prerequisites: z.array(z.string()).default([]),
  firm_relevance: z.record(z.string(), z.number()).default({}),
  domain: DomainEnum.optional(),
  summary: z.string().optional(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const LearningResourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string().url(),
  kind: z.enum(["internal", "external"]),
  provenance: ProvenanceEnum,
  concept_ids: z.array(z.string()).default([]),
  firm_ids: z.array(z.string()).default([]),
});
export type LearningResource = z.infer<typeof LearningResourceSchema>;

export const DiagramRefSchema = z.object({
  id: z.string(),
  type: z.string(),
  format: z.enum(["mermaid", "interactive-json"]),
  version: z.string(),
  a11y_fallback: z.string().optional(),
  concept_ids: z.array(z.string()).default([]),
});
export type DiagramRef = z.infer<typeof DiagramRefSchema>;

export const LearningModuleCheckpointKindEnum = z.enum([
  "lesson",
  "concept_lab",
  "drill",
  "quiz",
  "diagram",
]);
export type LearningModuleCheckpointKind = z.infer<
  typeof LearningModuleCheckpointKindEnum
>;

export const LearningModuleCheckpointSchema = z.object({
  kind: LearningModuleCheckpointKindEnum,
  id: z.string(),
  title: z.string(),
  position: z.number().int().nonnegative(),
  concept_id: z.string().nullable().optional(),
  question_ids: z.array(z.string()).default([]),
  diagram_id: z.string().nullable().optional(),
});
export type LearningModuleCheckpoint = z.infer<
  typeof LearningModuleCheckpointSchema
>;

export const LearningLessonSchema = z.object({
  id: z.string(),
  module_id: z.string(),
  checkpoint_id: z.string().nullable().optional(),
  title: z.string(),
  position: z.number().int().nonnegative(),
  summary: z.string().optional(),
  body_md: z.string().optional(),
  estimated_minutes: z.number().int().positive().nullable().optional(),
  concept_ids: z.array(z.string()).default([]),
  diagram_ids: z.array(z.string()).default([]),
  resource_ids: z.array(z.string()).default([]),
  publishable: z.boolean().default(false),
});
export type LearningLesson = z.infer<typeof LearningLessonSchema>;

export const LearningModuleSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  domain: DomainEnum.or(z.string()),
  track: BankTrackEnum.or(z.string()).nullable().optional(),
  summary: z.string(),
  estimated_minutes: z.number().int().positive(),
  concept_ids: z.array(z.string()).default([]),
  diagram_ids: z.array(z.string()).default([]),
  prereq_module_ids: z.array(z.string()).default([]),
  checkpoints: z.array(LearningModuleCheckpointSchema).default([]),
  lesson_ids: z.array(z.string()).default([]),
  publishable: z.boolean().default(false),
});
export type LearningModule = z.infer<typeof LearningModuleSchema>;

export const ModuleProgressSchema = z.object({
  user_id: z.string(),
  module_id: z.string(),
  completed_checkpoint_ids: z.array(z.string()).default([]),
  percent: z.number().min(0).max(100),
  updated_at: z.string(),
});
export type ModuleProgress = z.infer<typeof ModuleProgressSchema>;

export const PseudoRagPackSchema = z.object({
  query: z.string(),
  firm_ids: z.array(z.string()),
  item_ids: z.array(z.string()),
  scores: z.array(z.number()),
  citations: z.array(
    z.object({
      item_id: z.string(),
      provenance: ProvenanceEnum,
      label: z.string().optional(),
    }),
  ),
  frozen_at: z.string(),
});
export type PseudoRagPack = z.infer<typeof PseudoRagPackSchema>;

export const TeachingAnswerSourceProvenanceEnum = ProvenanceEnum.exclude([
  "glassdoor_occurrence",
]);
export type TeachingAnswerSourceProvenance = z.infer<
  typeof TeachingAnswerSourceProvenanceEnum
>;

export const AnswerFormulaSchema = z.object({
  label: z.string(),
  expression: z.string(),
  explanation: z.string().optional(),
});
export type AnswerFormula = z.infer<typeof AnswerFormulaSchema>;

export const AnswerFollowUpSchema = z.object({
  question: z.string(),
  source_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
});
export type AnswerFollowUp = z.infer<typeof AnswerFollowUpSchema>;

export const AnswerLayerKindEnum = z.enum([
  "direct_answer",
  "interview_ready",
  "walkthrough",
  "diagram_ref",
  "formulae",
  "assumptions",
  "common_mistakes",
  "follow_ups",
  "related_concepts",
  "resources",
  "provenance",
  "validation",
]);
export type AnswerLayerKind = z.infer<typeof AnswerLayerKindEnum>;

export const AnswerLayerOrderSchema = z
  .array(AnswerLayerKindEnum)
  .default([
    "direct_answer",
    "interview_ready",
    "walkthrough",
    "diagram_ref",
    "formulae",
    "assumptions",
    "common_mistakes",
    "follow_ups",
    "related_concepts",
    "resources",
    "provenance",
    "validation",
  ]);
export type AnswerLayerOrder = z.infer<typeof AnswerLayerOrderSchema>;

export const AnswerLayerCitationSchema = z.object({
  source_id: z.string(),
  label: z.string().optional(),
  provenance: TeachingAnswerSourceProvenanceEnum.optional(),
});
export type AnswerLayerCitation = z.infer<typeof AnswerLayerCitationSchema>;

export const AnswerLayersProvenanceSchema = z.object({
  answer_provenance: AnswerProvenanceEnum,
  source_ids: z.array(z.string()).default([]),
  citations: z.array(AnswerLayerCitationSchema).default([]),
  generator_version: z.string().nullable().optional(),
});
export type AnswerLayersProvenance = z.infer<
  typeof AnswerLayersProvenanceSchema
>;

export const AnswerLayersValidationSchema = z.object({
  status: ValidationStatusEnum.default("not_run"),
  confidence: z.number().min(0).max(1).nullable().optional(),
  validator_version: z.string().nullable().optional(),
  checked_at: z.string().nullable().optional(),
  issues: z.array(z.string()).default([]),
});
export type AnswerLayersValidation = z.infer<
  typeof AnswerLayersValidationSchema
>;

export const AnswerLayersSchema = z.object({
  layer_order: AnswerLayerOrderSchema,
  direct_answer: z.string(),
  interview_ready: z.string(),
  walkthrough: z.string(),
  diagram_ref: DiagramRefSchema.nullable().optional(),
  formulae: z.array(AnswerFormulaSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  common_mistakes: z.array(z.string()).default([]),
  follow_ups: z.array(AnswerFollowUpSchema).default([]),
  related_concept_ids: z.array(z.string()).default([]),
  resources: z.array(LearningResourceSchema).default([]),
  provenance: AnswerLayersProvenanceSchema,
  validation: AnswerLayersValidationSchema,
});
export type AnswerLayers = z.infer<typeof AnswerLayersSchema>;

export const QuestionStudyPayloadSchema = z.object({
  question_id: z.string(),
  answer_id: z.string().nullable().optional(),
  canonical_question_id: z.string().nullable().optional(),
  question_text: z.string(),
  topic: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  firm_context: z
    .object({
      firm_id: z.string(),
      occurrence_count: z.number().int().nonnegative().optional(),
      stage: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  layers: AnswerLayersSchema,
  mastery: MasteryLevelEnum.nullable().optional(),
  weak_topic_ids: z.array(z.string()).default([]),
});
export type QuestionStudyPayload = z.infer<typeof QuestionStudyPayloadSchema>;

export const PracticeSessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  mode: PracticeSessionModeEnum,
  learning_mode: LearningModeEnum.optional(),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  question_ids: z.array(z.string()).default([]),
  started_at: z.string(),
  completed_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type PracticeSession = z.infer<typeof PracticeSessionSchema>;

export const SimulatorStageSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int().nonnegative(),
  prompt: z.string().optional(),
  question_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  diagram_ids: z.array(z.string()).default([]),
  estimated_minutes: z.number().int().positive().nullable().optional(),
});
export type SimulatorStage = z.infer<typeof SimulatorStageSchema>;

export const SimulatorStageScoreSchema = z.object({
  stage_id: z.string(),
  score: z.number().min(0).max(1),
  rubric: z.record(z.string(), z.number().min(0).max(1)).default({}),
  notes: z.string().optional(),
});
export type SimulatorStageScore = z.infer<typeof SimulatorStageScoreSchema>;

export const SimulatorScoresMetadataSchema = z.object({
  overall: z.number().min(0).max(1).nullable().optional(),
  readiness: z.number().min(0).max(1).nullable().optional(),
  stage_scores: z.array(SimulatorStageScoreSchema).default([]),
  weak_stage_ids: z.array(z.string()).default([]),
});
export type SimulatorScoresMetadata = z.infer<
  typeof SimulatorScoresMetadataSchema
>;

export const SimulatorSessionMetadataSchema = z.object({
  firm_id: z.string(),
  role_id: z.string().nullable().optional(),
  interviewer_id: z.string(),
  stages: z.array(SimulatorStageSchema).default([]),
  scores: SimulatorScoresMetadataSchema.default({}),
  transcript_turn_ids: z.array(z.string()).default([]),
  recommended_concept_ids: z.array(z.string()).default([]),
  recommended_module_ids: z.array(z.string()).default([]),
  template_version: z.string().nullable().optional(),
});
export type SimulatorSessionMetadata = z.infer<
  typeof SimulatorSessionMetadataSchema
>;

export const SimulatorPracticeSessionSchema = PracticeSessionSchema.extend({
  mode: z.literal("simulator"),
  firm_ids: z.array(z.string()).min(1),
  metadata: SimulatorSessionMetadataSchema,
});
export type SimulatorPracticeSession = z.infer<
  typeof SimulatorPracticeSessionSchema
>;

export const StudyPlanItemKindEnum = z.enum([
  "question",
  "concept",
  "resource",
  "diagram",
  "module",
  "module_checkpoint",
]);
export type StudyPlanItemKind = z.infer<typeof StudyPlanItemKindEnum>;

export const StudyPlanItemSchema = z.object({
  kind: StudyPlanItemKindEnum,
  id: z.string(),
  due_at: z.string().nullable().optional(),
});
export type StudyPlanItem = z.infer<typeof StudyPlanItemSchema>;

export const AttemptScoreSourceEnum = z.enum([
  "self",
  "llm",
  "deterministic",
]);
export type AttemptScoreSource = z.infer<typeof AttemptScoreSourceEnum>;

export const AttemptGradeCitationSchema = z.object({
  id: z.string(),
  kind: z.enum(["teaching_answer", "heat_topic", "occurrence"]),
  label: z.string().optional(),
});
export type AttemptGradeCitation = z.infer<typeof AttemptGradeCitationSchema>;

export const AttemptSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  session_id: z.string().nullable().optional(),
  canonical_question_id: z.string(),
  answer_id: z.string().nullable().optional(),
  response_text: z.string().optional(),
  self_score: z.number().min(0).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  time_spent_ms: z.number().int().nonnegative().nullable().optional(),
  correct: z.boolean().nullable().optional(),
  weak_topics: z.array(z.string()).default([]),
  firm_id: z.string().nullable().optional(),
  score_source: AttemptScoreSourceEnum.optional(),
  llm_score: z.number().min(0).max(1).nullable().optional(),
  rubric_json: z.record(z.unknown()).nullable().optional(),
  grade_citations: z.array(AttemptGradeCitationSchema).default([]),
  created_at: z.string(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const MasterySchema = z.object({
  user_id: z.string(),
  subject_type: z.enum(["concept", "topic", "canonical_question", "firm_topic"]),
  subject_id: z.string(),
  level: MasteryLevelEnum.default("unseen"),
  score: z.number().min(0).max(1).default(0),
  attempt_count: z.number().int().nonnegative().default(0),
  last_attempt_at: z.string().nullable().optional(),
  next_review_at: z.string().nullable().optional(),
  firm_id: z.string().nullable().optional(),
  updated_at: z.string(),
});
export type Mastery = z.infer<typeof MasterySchema>;

export const StudyPlanSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  learning_mode: LearningModeEnum,
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  weak_topic_ids: z.array(z.string()).default([]),
  items: z.array(StudyPlanItemSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type StudyPlan = z.infer<typeof StudyPlanSchema>;

export const SavedEntityKindEnum = z.enum([
  "question",
  "concept",
  "firm",
  "module",
  "module_checkpoint",
  "resource",
  "diagram",
]);
export type SavedEntityKind = z.infer<typeof SavedEntityKindEnum>;

export const BookmarkSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entity_kind: SavedEntityKindEnum,
  entity_id: z.string(),
  firm_ids: z.array(z.string()).default([]),
  provenance: ProvenanceEnum.nullable().optional(),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const CollectionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  cover_asset_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionItemSchema = z.object({
  id: z.string(),
  collection_id: z.string(),
  entity_kind: SavedEntityKindEnum,
  entity_id: z.string(),
  position: z.number().int().nonnegative(),
  note: z.string().nullable().optional(),
  created_at: z.string(),
});
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

export const SearchRequestSchema = z.object({
  q: z.string().default(""),
  mode: LearningModeEnum.optional(),
  tracks: z.array(BankTrackEnum.or(z.string())).default([]),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  domains: z.array(DomainEnum).default([]),
  provenance: z.array(ProvenanceEnum).default([]),
  include_topic_signals: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  cursor: z.string().nullable().optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchHitSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "canonical_question",
    "concept",
    "firm",
    "resource",
    "occurrence",
  ]),
  title: z.string(),
  snippet: z.string().optional(),
  score: z.number(),
  provenance: ProvenanceEnum.optional(),
  firm_ids: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const SearchResponseSchema = z.object({
  query: SearchRequestSchema,
  hits: z.array(SearchHitSchema),
  total: z.number().int().nonnegative(),
  next_cursor: z.string().nullable().optional(),
  took_ms: z.number().nonnegative().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
