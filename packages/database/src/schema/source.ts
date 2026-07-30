import { boolean, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { rawSchema } from "./namespaces.js";

export const sources = rawSchema.table("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  family: text("family").notNull(),
  configJson: jsonb("config_json").notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceRuns = rawSchema.table("source_runs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  browserMode: text("browser_mode"),
  crawlVersion: text("crawl_version"),
  parserVersion: text("parser_version"),
  metricsJson: jsonb("metrics_json").notNull().default({}),
  message: text("message"),
});

export const sourceArtifacts = rawSchema.table("source_artifacts", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  sourceRunId: text("source_run_id"),
  urlOrPath: text("url_or_path").notNull(),
  commitSha: text("commit_sha"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
  rawHtmlPath: text("raw_html_path"),
  rawJsonPath: text("raw_json_path"),
  screenshotPath: text("screenshot_path"),
  networkLogPath: text("network_log_path"),
  contentHash: text("content_hash").notNull(),
  mainContentHash: text("main_content_hash"),
  parserVersion: text("parser_version").notNull(),
  accessState: text("access_state").notNull().default("ok"),
  sessionClass: text("session_class"),
  licenseSnapshot: text("license_snapshot"),
  httpMetadataJson: jsonb("http_metadata_json").notNull().default({}),
  diagnosticsJson: jsonb("diagnostics_json").notNull().default({}),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crawlFailures = rawSchema.table("crawl_failures", {
  id: text("id").primaryKey(),
  sourceId: text("source_id"),
  sourceRunId: text("source_run_id"),
  urlOrPath: text("url_or_path"),
  errorClassification: text("error_classification").notNull(),
  errorMessage: text("error_message").notNull(),
  diagnosticsJson: jsonb("diagnostics_json").notNull().default({}),
  retryable: boolean("retryable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
