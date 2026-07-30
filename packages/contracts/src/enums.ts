/**
 * Shared enums — aligned with src/ibpe_corpus/schemas/models.py
 */
import { z } from "zod";

/** Glassdoor bank track labels (uppercase product/scrape surface). */
export const BankTrackEnum = z.enum(["IB", "PE", "Banking", "VC"]);
export type BankTrack = z.infer<typeof BankTrackEnum>;

/** Canonical corpus domain (lowercase; maps from bank track). */
export const DomainEnum = z.enum(["ib", "pe", "both", "other"]);
export type Domain = z.infer<typeof DomainEnum>;

export const AccessStateEnum = z.enum([
  "public",
  "authenticated",
  "blocked",
  "captcha",
  "throttled",
  "not_found",
  "unknown",
]);
export type AccessState = z.infer<typeof AccessStateEnum>;

export const ExtractionClassEnum = z.enum([
  "exact_question",
  "paraphrased_question",
  "topic_signal",
  "interview_format",
  "source_provided_answer",
  "candidate_attempt",
  "community_answer",
  "discussion_comment",
  "preparation_advice",
  "not_relevant",
]);
export type ExtractionClass = z.infer<typeof ExtractionClassEnum>;

export const ResponseTypeEnum = z.enum([
  "candidate_answer",
  "community_answer",
  "clarification",
  "discussion_comment",
  "spam_or_irrelevant",
  "unknown",
]);
export type ResponseType = z.infer<typeof ResponseTypeEnum>;

export const PERelevanceEnum = z.enum([
  "core_pe_investing",
  "adjacent_pe_investing",
  "portfolio_operations",
  "allocator_or_fund_selection",
  "pe_advisory",
  "fund_operations",
  "not_pe",
]);
export type PERelevance = z.infer<typeof PERelevanceEnum>;

/** Answer provenance for teaching corpus (Pydantic AnswerProvenance). */
export const AnswerProvenanceEnum = z.enum([
  "source_provided",
  "corpus_matched",
  "synthesised_unvalidated",
  "synthesised_validated",
  "needs_review",
  "rejected",
]);
export type AnswerProvenance = z.infer<typeof AnswerProvenanceEnum>;

/**
 * Broader learning provenance used by product packs/resources.
 * Distinct from AnswerProvenance — do not conflate synthesised teaching answers
 * with glassdoor_occurrence firm signals.
 */
export const ProvenanceEnum = z.enum([
  "github_source",
  "static_seed",
  "glassdoor_occurrence",
  "gemini_synthesised",
  "editorial",
]);
export type Provenance = z.infer<typeof ProvenanceEnum>;

export const ValidationStatusEnum = z.enum([
  "pass",
  "pass_with_assumptions",
  "needs_correction",
  "reject",
  "not_run",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusEnum>;

export const LearningModeEnum = z.enum(["company_prep", "concept_learn"]);
export type LearningMode = z.infer<typeof LearningModeEnum>;

export const JobStateEnum = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "dead_letter",
  "skipped",
]);
export type JobState = z.infer<typeof JobStateEnum>;

export const VariantTypeEnum = z.enum([
  "exact",
  "paraphrase",
  "topic_signal",
  "numerical_variant",
]);
export type VariantType = z.infer<typeof VariantTypeEnum>;

export const ScrapeBackendEnum = z.enum(["browser", "bff"]);
export type ScrapeBackend = z.infer<typeof ScrapeBackendEnum>;

export const PracticeSessionModeEnum = z.enum([
  "company",
  "concept",
  "adaptive_weak",
  "pseudo_rag",
]);
export type PracticeSessionMode = z.infer<typeof PracticeSessionModeEnum>;

export const MasteryLevelEnum = z.enum([
  "unseen",
  "learning",
  "familiar",
  "proficient",
  "mastered",
]);
export type MasteryLevel = z.infer<typeof MasteryLevelEnum>;

export const ApiErrorCodeEnum = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "upstream_blocked",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeEnum>;
