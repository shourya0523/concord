import {
  boolean,
  doublePrecision,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { canonicalSchema } from "./namespaces.js";

export const answers = canonicalSchema.table("answers", {
  id: text("id").primaryKey(),
  canonicalQuestionId: text("canonical_question_id").notNull(),
  conciseAnswer: text("concise_answer").notNull(),
  expandedExplanation: text("expanded_explanation").notNull(),
  assumptionsJson: jsonb("assumptions_json").notNull().default([]),
  calculationJson: jsonb("calculation_json"),
  commonMistakesJson: jsonb("common_mistakes_json").notNull().default([]),
  followUpsJson: jsonb("follow_ups_json").notNull().default([]),
  provenanceType: text("provenance_type").notNull(),
  sourceIdsJson: jsonb("source_ids_json").notNull().default([]),
  generatorVersion: text("generator_version"),
  validatorVersion: text("validator_version"),
  validationStatus: text("validation_status").notNull().default("not_run"),
  confidence: doublePrecision("confidence").notNull().default(0.5),
  difficulty: text("difficulty"),
  referencesJson: jsonb("references_json").notNull().default([]),
  publishable: boolean("publishable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const answerVersions = canonicalSchema.table("answer_versions", {
  id: text("id").primaryKey(),
  answerId: text("answer_id").notNull(),
  version: text("version").notNull(),
  bodyJson: jsonb("body_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const answerSources = canonicalSchema.table("answer_sources", {
  id: text("id").primaryKey(),
  answerId: text("answer_id").notNull(),
  sourceArtifactId: text("source_artifact_id"),
  provenance: text("provenance").notNull(),
  label: text("label"),
  url: text("url"),
});

export const answerValidationResults = canonicalSchema.table("answer_validation_results", {
  id: text("id").primaryKey(),
  answerId: text("answer_id").notNull(),
  validatorVersion: text("validator_version").notNull(),
  status: text("status").notNull(),
  issuesJson: jsonb("issues_json").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
