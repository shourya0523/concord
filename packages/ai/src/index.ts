/**
 * AI helpers: OpenRouter client + model tiers (Jev decisions, small chat,
 * structured JSON, embeddings, transcription) and the enrichment proposal
 * schemas.
 *
 * Everything calls OpenRouter with `OPENROUTER_API_KEY`; model ids come from
 * the tiers in ./models.ts (docs/deployment/llm-stack.md). GEMINI_API_KEY is
 * no longer used by the TypeScript stack.
 */
import { z } from "zod";
import { DEFAULT_SMALL_MODEL } from "./models.js";

export {
  DEFAULT_EMBEDDING_DIMS,
  DEFAULT_EMBEDDING_MODEL,
  cosineSimilarity,
  embedText,
  embedTexts,
  embeddingModelId,
  isEmbeddingConfigured,
  toPgVectorLiteral,
} from "./embeddings.js";
export {
  DEFAULT_GRADE_MODEL,
  gradeModelConfig,
  gradeModelId,
  type GradeModelConfig,
} from "./grade.js";
export {
  acceptDraft,
  DRAFT_SUPPORT_QUESTION,
  verifyDraft,
  type DraftVerdict,
  type DraftVerification,
} from "./cascade.js";
export {
  DECISIONS_PATH,
  decide,
  decisionsUrl,
  isTransientOpenRouterError,
  parseDecisionAnswers,
  validateQuestions,
  type AnswerFor,
  type ChoiceAnswer,
  type ChoiceQuestion,
  type DecideRequest,
  type DecisionAnswer,
  type DecisionAnswers,
  type DecisionQuestion,
  type DecisionQuestions,
  type DecisionResult,
  type DecisionUsage,
  type NoulAnswer,
  type NoulQuestion,
  type ScoreAnswer,
  type ScoreQuestion,
} from "./decisions.js";
export {
  DEFAULT_DECISION_MODEL,
  DEFAULT_EMBED_DIMS,
  DEFAULT_EMBED_MODEL,
  DEFAULT_JEV_ACCEPT_CONFIDENCE,
  DEFAULT_JEV_CONFIDENCE_FLOOR,
  DEFAULT_SMALL_MODEL,
  DEFAULT_STT_MODEL,
  decisionModel,
  embedModel,
  isJevModel,
  isLlmConfigured,
  jevAcceptConfidence,
  jevConfidenceFloor,
  modelForTier,
  openRouterApiKey,
  resetModelWarnings,
  smallModel,
  sttModel,
  tierModels,
  type LlmTier,
} from "./models.js";
export {
  DEFAULT_OPENROUTER_BASE_URL,
  OpenRouterError,
  buildChatBody,
  chat,
  chatJson,
  embed,
  errorCodeForStatus,
  extractJson,
  parseJsonReply,
  toJsonSchema,
  transcribe,
  type ChatJsonResult,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ChatUsage,
  type ClientOptions,
  type OpenRouterErrorCode,
  type TranscribeRequest,
} from "./openrouter.js";

/**
 * Enrichment model for TS callers (the Python enrich worker has its own
 * config). `gemini_synthesised` below is a stored provenance value, not a
 * statement about which model produced the text.
 */
export const DEFAULT_ENRICH_MODEL = DEFAULT_SMALL_MODEL;

export const EnrichmentProvenanceEnum = z.enum([
  "gemini_synthesised",
  "editorial",
  "deterministic_calculation",
]);

export const LearningModeEnum = z.enum([
  "company_prep",
  "concept_learn",
  "both",
]);

export const FirmSoftTagSchema = z.object({
  firm_id: z.string(),
  firm_name: z.string().optional(),
  relevance: z.number().min(0).max(1).default(0.5),
  rationale: z.string().optional(),
});

export const ConceptHintSchema = z.object({
  slug: z.string(),
  title: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
});

export const DiagramDraftSchema = z.object({
  type: z.string().default("generic"),
  format: z.enum(["mermaid", "interactive-json"]).default("mermaid"),
  spec: z.string(),
  a11y_fallback: z.string().optional(),
  provenance: EnrichmentProvenanceEnum.default("gemini_synthesised"),
});

export const ResourceDraftSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  kind: z.enum(["internal", "external"]).default("external"),
  concept_ids: z.array(z.string()).default([]),
  firm_ids: z.array(z.string()).default([]),
  provenance: EnrichmentProvenanceEnum.default("gemini_synthesised"),
});

export const ModeRoutingSchema = z.object({
  modes: z.array(LearningModeEnum).default(["both"]),
  company_prep_weight: z.number().min(0).max(1).default(0.5),
  concept_learn_weight: z.number().min(0).max(1).default(0.5),
});

/** Structured LLM enrichment proposal (staging only until validated). */
export const EnrichmentProposalSchema = z.object({
  canonical_question_id: z.string(),
  track: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  subtopic: z.string().nullable().optional(),
  concepts: z.array(ConceptHintSchema).default([]),
  difficulty: z.string().nullable().optional(),
  interview_stage_hints: z.array(z.string()).default([]),
  firm_soft_tags: z.array(FirmSoftTagSchema).default([]),
  mode_routing: ModeRoutingSchema.default({}),
  pe_relevance: z.string().nullable().optional(),
  ib_relevance: z.string().nullable().optional(),
  interview_ready_rewrite: z.string().nullable().optional(),
  diagram_drafts: z.array(DiagramDraftSchema).default([]),
  resource_drafts: z.array(ResourceDraftSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  provenance: z.literal("gemini_synthesised").default("gemini_synthesised"),
  model_version: z.string(),
  prompt_version: z.string(),
});

export type EnrichmentProposal = z.infer<typeof EnrichmentProposalSchema>;

/** Refuse laundering LLM output as Glassdoor or GitHub teaching source. */
export function assertEnrichmentProvenance(provenance: string): void {
  const forbidden = new Set([
    "glassdoor",
    "glassdoor_occurrence",
    "github_source",
    "source_provided",
    "imported",
    "static_seed",
  ]);
  if (forbidden.has(provenance)) {
    throw new Error(
      `Refusing to attribute enrichment as ${provenance}; use gemini_synthesised`,
    );
  }
}
