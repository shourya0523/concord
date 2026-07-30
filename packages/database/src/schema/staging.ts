import {
  doublePrecision,
  jsonb,
  text,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { stagingSchema } from "./namespaces.js";

export const rawRecords = stagingSchema.table("raw_records", {
  id: text("id").primaryKey(),
  sourceArtifactId: text("source_artifact_id").notNull(),
  exactSourceText: text("exact_source_text").notNull(),
  sourceSelectorOrSpan: text("source_selector_or_span"),
  recordType: text("record_type").notNull(),
  extractionMethod: text("extraction_method").notNull(),
  extractedMetadataJson: jsonb("extracted_metadata_json").notNull().default({}),
  groundingConfidence: doublePrecision("grounding_confidence").notNull().default(1),
  validationStatus: text("validation_status").notNull().default("not_run"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stagingRecords = stagingSchema.table("staging_records", {
  id: text("id").primaryKey(),
  sourceArtifactId: text("source_artifact_id"),
  sourceRunId: text("source_run_id"),
  legacyBankId: text("legacy_bank_id").unique(),
  exactSourceText: text("exact_source_text").notNull(),
  sourceSpanOrPath: text("source_span_or_path"),
  extractedQuestion: text("extracted_question"),
  extractedAnswer: text("extracted_answer"),
  processText: text("process_text"),
  firmRaw: text("firm_raw"),
  roleRaw: text("role_raw"),
  officeRaw: text("office_raw"),
  interviewStageRaw: text("interview_stage_raw"),
  trackRaw: text("track_raw"),
  reportedDateRaw: text("reported_date_raw"),
  recordType: text("record_type").notNull().default("glassdoor_occurrence"),
  extractionConfidence: doublePrecision("extraction_confidence").notNull().default(1),
  validationIssuesJson: jsonb("validation_issues_json").notNull().default([]),
  geminiLabelsJson: jsonb("gemini_labels_json").notNull().default({}),
  bankPayloadJson: jsonb("bank_payload_json").notNull().default({}),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const normalisedRecords = stagingSchema.table("normalised_records", {
  id: text("id").primaryKey(),
  stagingRecordId: text("staging_record_id").notNull().unique(),
  firmId: text("firm_id"),
  roleId: text("role_id"),
  officeId: text("office_id"),
  track: text("track"),
  interviewRound: text("interview_round"),
  reportedDate: date("reported_date"),
  topicSlugs: text("topic_slugs").array().notNull().default([]),
  difficulty: text("difficulty"),
  wordingNormalised: text("wording_normalised"),
  wordingHash: text("wording_hash"),
  originalsJson: jsonb("originals_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const validationResults = stagingSchema.table("validation_results", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  validatorVersion: text("validator_version").notNull(),
  status: text("status").notNull(),
  issuesJson: jsonb("issues_json").notNull().default([]),
  scoresJson: jsonb("scores_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
