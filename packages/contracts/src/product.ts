/**
 * Product-facing entities: firms, roles, practice, search, learning packs.
 */
import { z } from "zod";
import {
  BankTrackEnum,
  DomainEnum,
  LearningModeEnum,
  MasteryLevelEnum,
  PracticeSessionModeEnum,
  ProvenanceEnum,
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
  items: z
    .array(
      z.object({
        kind: z.enum(["question", "concept", "resource", "diagram"]),
        id: z.string(),
        due_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type StudyPlan = z.infer<typeof StudyPlanSchema>;

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
