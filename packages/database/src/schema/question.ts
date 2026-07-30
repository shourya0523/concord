import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { canonicalSchema } from "./namespaces.js";

export const canonicalQuestions = canonicalSchema.table("canonical_questions", {
  id: text("id").primaryKey(),
  canonicalWording: text("canonical_wording").notNull(),
  questionType: text("question_type"),
  topic: text("topic"),
  subtopic: text("subtopic"),
  domain: text("domain"),
  track: text("track"),
  peStrategy: text("pe_strategy"),
  peRelevance: text("pe_relevance"),
  seniority: text("seniority"),
  difficulty: text("difficulty"),
  reviewState: text("review_state").notNull().default("draft"),
  normalisedHash: text("normalised_hash"),
  provenance: text("provenance").notNull().default("github_source"),
  publishable: boolean("publishable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionVariants = canonicalSchema.table("question_variants", {
  id: text("id").primaryKey(),
  canonicalQuestionId: text("canonical_question_id"),
  sourceWording: text("source_wording").notNull(),
  cleanedWording: text("cleaned_wording").notNull(),
  normalisedHash: text("normalised_hash").notNull(),
  language: text("language").notNull().default("en"),
  variantType: text("variant_type"),
  sourceArtifactId: text("source_artifact_id"),
  legacyBankId: text("legacy_bank_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionOccurrences = canonicalSchema.table("question_occurrences", {
  id: text("id").primaryKey(),
  questionVariantId: text("question_variant_id"),
  canonicalQuestionId: text("canonical_question_id"),
  stagingRecordId: text("staging_record_id"),
  legacyBankId: text("legacy_bank_id").unique(),
  interviewReviewId: text("interview_review_id"),
  firmId: text("firm_id"),
  employerRaw: text("employer_raw"),
  roleId: text("role_id"),
  roleRaw: text("role_raw"),
  officeRaw: text("office_raw"),
  roundRaw: text("round_raw"),
  track: text("track"),
  interviewDate: date("interview_date"),
  recruitingCycle: text("recruiting_cycle"),
  outcome: text("outcome"),
  processText: text("process_text"),
  sourceId: text("source_id").notNull(),
  confidence: doublePrecision("confidence").notNull().default(1),
  detailUrl: text("detail_url"),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionRelationships = canonicalSchema.table("question_relationships", {
  id: text("id").primaryKey(),
  fromQuestionId: text("from_question_id").notNull(),
  toQuestionId: text("to_question_id").notNull(),
  relationshipType: text("relationship_type").notNull(),
  confidence: doublePrecision("confidence").notNull().default(1),
  reversible: boolean("reversible").notNull().default(true),
  auditJson: jsonb("audit_json").notNull().default({}),
});

export const questionTopics = canonicalSchema.table(
  "question_topics",
  {
    questionId: text("question_id").notNull(),
    topicSlug: text("topic_slug").notNull(),
    confidence: doublePrecision("confidence").notNull().default(1),
    method: text("method").notNull().default("editorial"),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.topicSlug] })],
);

export const questionFirms = canonicalSchema.table(
  "question_firms",
  {
    questionId: text("question_id").notNull(),
    firmId: text("firm_id").notNull(),
    relevance: doublePrecision("relevance").notNull().default(0.5),
    method: text("method").notNull().default("glassdoor_occurrence"),
    sampleSize: integer("sample_size").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.firmId] })],
);

export const questionRoles = canonicalSchema.table(
  "question_roles",
  {
    questionId: text("question_id").notNull(),
    roleId: text("role_id").notNull(),
    relevance: doublePrecision("relevance").notNull().default(0.5),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.roleId] })],
);
