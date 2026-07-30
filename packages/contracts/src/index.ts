/**
 * Phase 0 minimum shared contracts (Zod).
 * Expand in Workstream A — do not diverge from bank JSON or Python Pydantic mirrors.
 */
import { z } from "zod";

/** Glassdoor signal row — matches data/question_bank.json questions[] */
export const BankQuestionSchema = z.object({
  id: z.string(),
  company: z.string(),
  track: z.enum(["IB", "PE", "Banking", "VC"]).or(z.string()),
  position: z.string(),
  date_posted: z.string().nullable().optional(),
  user: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  question: z.string(),
  process: z.string().nullable().optional(),
  scraped_at: z.string(),
});
export type BankQuestion = z.infer<typeof BankQuestionSchema>;

export const CompletedJobSchema = z.object({
  company: z.string(),
  position: z.string(),
  track: z.string().optional(),
  completed_at: z.string().optional(),
  backend: z.string().optional(),
}).passthrough();
export type CompletedJob = z.infer<typeof CompletedJobSchema>;

export const QuestionBankFileSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  updated_at: z.string().optional(),
  questions: z.array(BankQuestionSchema),
  completed_jobs: z.array(CompletedJobSchema).optional(),
});
export type QuestionBankFile = z.infer<typeof QuestionBankFileSchema>;

export const ProvenanceEnum = z.enum([
  "github_source",
  "static_seed",
  "glassdoor_occurrence",
  "gemini_synthesised",
  "editorial",
]);
export type Provenance = z.infer<typeof ProvenanceEnum>;

export const LearningModeEnum = z.enum(["company_prep", "concept_learn"]);
export type LearningMode = z.infer<typeof LearningModeEnum>;

export const TopicHeatSchema = z.object({
  firm_id: z.string(),
  topic_id: z.string(),
  intensity: z.number().min(0).max(1),
  sample_size: z.number().int().nonnegative(),
  window: z.string().optional(),
  method: z.enum(["glassdoor_occurrence", "enriched", "editorial"]).default("glassdoor_occurrence"),
});
export type TopicHeat = z.infer<typeof TopicHeatSchema>;

export const ConceptSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  prerequisites: z.array(z.string()).default([]),
  firm_relevance: z.record(z.string(), z.number()).default({}),
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
