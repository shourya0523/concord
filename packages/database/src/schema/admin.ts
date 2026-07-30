import { boolean, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { adminSchema } from "./namespaces.js";

export const ingestionJobs = adminSchema.table("ingestion_jobs", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  jobName: text("job_name").notNull(),
  state: text("state").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  retryCount: integer("retry_count").notNull().default(0),
  errorClassification: text("error_classification"),
  inputCount: integer("input_count").notNull().default(0),
  outputCount: integer("output_count").notNull().default(0),
  parserOrModelVersion: text("parser_or_model_version"),
  resumeCheckpointJson: jsonb("resume_checkpoint_json").notNull().default({}),
  metricsJson: jsonb("metrics_json").notNull().default({}),
  message: text("message"),
});

export const deadLetters = adminSchema.table("dead_letters", {
  id: text("id").primaryKey(),
  jobName: text("job_name").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  errorClassification: text("error_classification").notNull(),
  errorMessage: text("error_message").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  retryable: boolean("retryable").notNull().default(false),
});

export const mergeDecisions = adminSchema.table("merge_decisions", {
  id: text("id").primaryKey(),
  survivorId: text("survivor_id").notNull(),
  mergedId: text("merged_id").notNull(),
  reason: text("reason"),
  reversible: boolean("reversible").notNull().default(true),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewTasks = adminSchema.table("review_tasks", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  status: text("status").notNull().default("open"),
  assignee: text("assignee"),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = adminSchema.table("audit_events", {
  id: text("id").primaryKey(),
  actor: text("actor"),
  action: text("action").notNull(),
  subjectType: text("subject_type"),
  subjectId: text("subject_id"),
  payloadJson: jsonb("payload_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = adminSchema.table("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  configJson: jsonb("config_json").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
