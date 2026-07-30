import {
  boolean,
  doublePrecision,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { canonicalSchema } from "./namespaces.js";

export const concepts = canonicalSchema.table("concepts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  track: text("track"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  publishable: boolean("publishable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conceptPrerequisites = canonicalSchema.table(
  "concept_prerequisites",
  {
    conceptId: text("concept_id").notNull(),
    prerequisiteId: text("prerequisite_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.conceptId, t.prerequisiteId] })],
);

export const conceptFirmWeights = canonicalSchema.table(
  "concept_firm_weights",
  {
    conceptId: text("concept_id").notNull(),
    firmId: text("firm_id").notNull(),
    weight: doublePrecision("weight").notNull().default(0),
    method: text("method").notNull().default("editorial"),
  },
  (t) => [primaryKey({ columns: [t.conceptId, t.firmId] })],
);

export const diagrams = canonicalSchema.table("diagrams", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  diagramType: text("diagram_type").notNull(),
  a11yFallback: text("a11y_fallback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const diagramVersions = canonicalSchema.table("diagram_versions", {
  id: text("id").primaryKey(),
  diagramId: text("diagram_id").notNull(),
  version: text("version").notNull(),
  format: text("format").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningResources = canonicalSchema.table("learning_resources", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull(),
  provenance: text("provenance").notNull(),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resourceLinks = canonicalSchema.table("resource_links", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull(),
  linkType: text("link_type").notNull(),
  conceptId: text("concept_id"),
  questionId: text("question_id"),
  firmId: text("firm_id"),
});
