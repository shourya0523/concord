/**
 * Topic / PE taxonomy shapes — absorb config/private_equity_taxonomy.yml
 * and product topic trees.
 */
import { z } from "zod";
import { DomainEnum, PERelevanceEnum } from "./enums.js";

export const TaxonomyRoleSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()).default([]),
  seniority: z.string().nullable().optional(),
  relevance: PERelevanceEnum.or(z.string()).optional(),
  search_modifiers: z.array(z.string()).optional(),
});
export type TaxonomyRole = z.infer<typeof TaxonomyRoleSchema>;

export const ConceptQuerySchema = z.object({
  id: z.string(),
  phrase: z.string(),
  concepts: z.array(z.string()).default([]),
});
export type ConceptQuery = z.infer<typeof ConceptQuerySchema>;

/** PE YAML taxonomy file (config/private_equity_taxonomy.yml). */
export const PrivateEquityTaxonomySchema = z.object({
  version: z.union([z.string(), z.number()]),
  relevance_labels: z.record(z.string(), z.string()).default({}),
  core_investing_roles: z.array(TaxonomyRoleSchema).default([]),
  strategy_roles: z.array(TaxonomyRoleSchema).default([]),
  exclusion_classes: z.array(TaxonomyRoleSchema).default([]),
  concept_queries: z.array(ConceptQuerySchema).default([]),
  classifier_keywords: z.record(z.string(), z.array(z.string())).default({}),
});
export type PrivateEquityTaxonomy = z.infer<typeof PrivateEquityTaxonomySchema>;

export const TopicNodeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  parent_id: z.string().nullable().optional(),
  domain: DomainEnum.or(z.string()).optional(),
  aliases: z.array(z.string()).default([]),
  concept_ids: z.array(z.string()).default([]),
});
export type TopicNode = z.infer<typeof TopicNodeSchema>;

/** Product topic taxonomy export (exports/taxonomy.json target). */
export const TopicTaxonomySchema = z.object({
  version: z.union([z.string(), z.number()]),
  updated_at: z.string().optional(),
  domains: z.array(DomainEnum).default(["ib", "pe", "both", "other"]),
  topics: z.array(TopicNodeSchema).default([]),
  pe: PrivateEquityTaxonomySchema.optional(),
});
export type TopicTaxonomy = z.infer<typeof TopicTaxonomySchema>;
