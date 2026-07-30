/**
 * Stub AI helpers for IB/PE Gemini enrichment (Workstream H).
 *
 * Prefer AI Gateway model strings. Structured enrich schema mirrors
 * Python `EnrichmentProposal` — keep in sync when expanding.
 *
 * Usage (when `ai` is installed in the app):
 *
 * ```ts
 * import { generateText, Output } from "ai";
 * import { EnrichmentProposalSchema, DEFAULT_ENRICH_MODEL } from "@ibpe/ai";
 *
 * const { output } = await generateText({
 *   model: DEFAULT_ENRICH_MODEL,
 *   output: Output.object({ schema: EnrichmentProposalSchema }),
 *   prompt: "...",
 * });
 * // output.provenance === "gemini_synthesised"
 * ```
 */
import { z } from "zod";

/** Newest stable flash-class Gemini via AI Gateway (fetch models before bumping). */
export const DEFAULT_ENRICH_MODEL = "google/gemini-2.5-flash";

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

/** Structured Gemini enrichment proposal (staging only until validated). */
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
  /** Hard-coded product rule — never glassdoor / github_source. */
  provenance: z.literal("gemini_synthesised").default("gemini_synthesised"),
  model_version: z.string(),
  prompt_version: z.string(),
});

export type EnrichmentProposal = z.infer<typeof EnrichmentProposalSchema>;

/** Refuse laundering Gemini output as Glassdoor or GitHub teaching source. */
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
