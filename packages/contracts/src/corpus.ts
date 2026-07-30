/**
 * Corpus / pipeline entities — mirror src/ibpe_corpus/schemas/models.py
 */
import { z } from "zod";
import {
  AccessStateEnum,
  AnswerProvenanceEnum,
  DomainEnum,
  ExtractionClassEnum,
  JobStateEnum,
  PERelevanceEnum,
  ResponseTypeEnum,
  ValidationStatusEnum,
  VariantTypeEnum,
} from "./enums.js";

export const RawArtefactSchema = z.object({
  id: z.string(),
  source_family: z.string(),
  url_or_path: z.string(),
  commit_sha: z.string().nullable().optional(),
  retrieved_at: z.string(),
  raw_html_path: z.string().nullable().optional(),
  raw_json_path: z.string().nullable().optional(),
  screenshot_path: z.string().nullable().optional(),
  network_log_path: z.string().nullable().optional(),
  content_hash: z.string(),
  parser_version: z.string(),
  access_state: AccessStateEnum.default("unknown"),
  session_class: z.string().default("unauthenticated"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RawArtefact = z.infer<typeof RawArtefactSchema>;

export const ExtractedRecordSchema = z.object({
  id: z.string(),
  source_artefact_id: z.string(),
  exact_source_text: z.string(),
  source_selector_or_span: z.string().nullable().optional(),
  record_type: ExtractionClassEnum,
  extraction_method: z.string(),
  extracted_metadata: z.record(z.string(), z.unknown()).default({}),
  grounding_confidence: z.number().min(0).max(1).default(1),
  validation_status: ValidationStatusEnum.default("not_run"),
});
export type ExtractedRecord = z.infer<typeof ExtractedRecordSchema>;

export const CanonicalQuestionSchema = z.object({
  id: z.string(),
  canonical_wording: z.string(),
  question_type: z.string().default("technical"),
  topic: z.string().nullable().optional(),
  subtopic: z.string().nullable().optional(),
  domain: DomainEnum.default("other"),
  pe_strategy: z.string().nullable().optional(),
  pe_relevance: PERelevanceEnum.nullable().optional(),
  seniority: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  review_state: z.string().default("accepted"),
  normalised_hash: z.string().nullable().optional(),
});
export type CanonicalQuestion = z.infer<typeof CanonicalQuestionSchema>;

export const QuestionVariantSchema = z.object({
  id: z.string(),
  canonical_question_id: z.string(),
  source_wording: z.string(),
  cleaned_wording: z.string(),
  normalised_hash: z.string(),
  language: z.string().default("en"),
  variant_type: VariantTypeEnum.default("exact"),
  source_artefact_id: z.string().nullable().optional(),
  embedding: z.array(z.number()).nullable().optional(),
});
export type QuestionVariant = z.infer<typeof QuestionVariantSchema>;

/** Interview occurrence — Glassdoor firm signal attachment point. */
export const InterviewOccurrenceSchema = z.object({
  id: z.string(),
  question_variant_id: z.string(),
  interview_review_id: z.string().nullable().optional(),
  employer: z.string().nullable().optional(),
  employer_id: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  office: z.string().nullable().optional(),
  round: z.string().nullable().optional(),
  interview_date: z.string().nullable().optional(),
  recruiting_cycle: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  source_id: z.string(),
  confidence: z.number().min(0).max(1).default(1),
  detail_url: z.string().nullable().optional(),
  /** Legacy bank question id when imported from Glassdoor signal seed. */
  legacy_bank_id: z.string().nullable().optional(),
  track: z.string().nullable().optional(),
});
export type InterviewOccurrence = z.infer<typeof InterviewOccurrenceSchema>;

/** Alias used in product docs. */
export const OccurrenceSchema = InterviewOccurrenceSchema;
export type Occurrence = InterviewOccurrence;

export const QuestionResponseSchema = z.object({
  id: z.string(),
  question_id: z.string(),
  source_response_id: z.string().nullable().optional(),
  response_type: ResponseTypeEnum,
  exact_source_text: z.string(),
  source_provided: z.boolean().default(true),
  posted_date: z.string().nullable().optional(),
  helpful_metadata: z.record(z.string(), z.unknown()).default({}),
  classification_confidence: z.number().min(0).max(1).default(0.5),
  parent_response_id: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  access_state: AccessStateEnum.default("public"),
  source_artefact_id: z.string().nullable().optional(),
});
export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;

/**
 * Teaching answer — GitHub source_provided preferred; Gemini synthesised only
 * with explicit provenance (never label synthesised as source_provided).
 */
export const AnswerSchema = z.object({
  id: z.string(),
  canonical_question_id: z.string(),
  concise_answer: z.string(),
  expanded_explanation: z.string(),
  assumptions: z.array(z.string()).default([]),
  calculation_representation: z.record(z.string(), z.unknown()).nullable().optional(),
  common_mistakes: z.array(z.string()).default([]),
  follow_ups: z.array(z.string()).default([]),
  provenance_type: AnswerProvenanceEnum,
  source_ids: z.array(z.string()).default([]),
  generator_version: z.string().nullable().optional(),
  validator_version: z.string().nullable().optional(),
  validation_status: ValidationStatusEnum.default("not_run"),
  confidence: z.number().min(0).max(1).default(0.5),
  difficulty: z.string().nullable().optional(),
  references: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
  diagram_ids: z.array(z.string()).default([]),
  resource_ids: z.array(z.string()).default([]),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const AnswerValidationSchema = z.object({
  answer_id: z.string(),
  status: ValidationStatusEnum,
  validator_version: z.string(),
  checked_at: z.string(),
  issues: z.array(z.string()).default([]),
  assumptions_accepted: z.array(z.string()).default([]),
  score: z.number().min(0).max(1).nullable().optional(),
});
export type AnswerValidation = z.infer<typeof AnswerValidationSchema>;

export const EmployerSchema = z.object({
  employer_id: z.string(),
  dynamic_profile_id: z.string().nullable().optional(),
  name: z.string(),
  slug: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});
export type Employer = z.infer<typeof EmployerSchema>;

export const InterviewReviewSchema = z.object({
  review_id: z.string(),
  employer: z.string().nullable().optional(),
  employer_id: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  office: z.string().nullable().optional(),
  interview_date: z.string().nullable().optional(),
  reported_date: z.string().nullable().optional(),
  round: z.string().nullable().optional(),
  process_description: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  offer_status: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  experience_sentiment: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});
export type InterviewReview = z.infer<typeof InterviewReviewSchema>;

export const JobResultSchema = z.object({
  job_name: z.string(),
  idempotency_key: z.string(),
  state: JobStateEnum,
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  retry_count: z.number().int().nonnegative().default(0),
  error_classification: z.string().nullable().optional(),
  input_count: z.number().int().nonnegative().default(0),
  output_count: z.number().int().nonnegative().default(0),
  parser_or_model_version: z.string().nullable().optional(),
  resume_checkpoint: z.record(z.string(), z.unknown()).default({}),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  message: z.string().nullable().optional(),
});
export type JobResult = z.infer<typeof JobResultSchema>;

export const DeadLetterSchema = z.object({
  id: z.string(),
  job_name: z.string(),
  idempotency_key: z.string(),
  error_classification: z.string(),
  error_message: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  retryable: z.boolean().default(false),
});
export type DeadLetter = z.infer<typeof DeadLetterSchema>;

export const SourceAdapterResultSchema = z.object({
  artefacts: z.array(RawArtefactSchema).default([]),
  extracted: z.array(ExtractedRecordSchema).default([]),
  responses: z.array(QuestionResponseSchema).default([]),
  access_state: AccessStateEnum.default("unknown"),
  diagnostics: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.number()).default({}),
});
export type SourceAdapterResult = z.infer<typeof SourceAdapterResultSchema>;
