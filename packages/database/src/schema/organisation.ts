import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { canonicalSchema } from "./namespaces.js";

export const firms = canonicalSchema.table("firms", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentFirmId: text("parent_firm_id"),
  trackFocus: text("track_focus"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const firmAliases = canonicalSchema.table("firm_aliases", {
  id: text("id").primaryKey(),
  firmId: text("firm_id").notNull(),
  alias: text("alias").notNull(),
  source: text("source"),
});

export const funds = canonicalSchema.table("funds", {
  id: text("id").primaryKey(),
  firmId: text("firm_id"),
  name: text("name").notNull(),
  metadataJson: jsonb("metadata_json").notNull().default({}),
});

export const offices = canonicalSchema.table("offices", {
  id: text("id").primaryKey(),
  firmId: text("firm_id"),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
});

export const roles = canonicalSchema.table("roles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  track: text("track"),
  seniority: text("seniority"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleAliases = canonicalSchema.table("role_aliases", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  alias: text("alias").notNull(),
});
