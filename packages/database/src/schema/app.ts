import {
  doublePrecision,
  integer,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { appSchema } from "./namespaces.js";

export const users = appSchema.table("users", {
  id: text("id").primaryKey(),
  neonAuthUserId: text("neon_auth_user_id").unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userProfiles = appSchema.table("user_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  targetTrack: text("target_track"),
  preferencesJson: jsonb("preferences_json").notNull().default({}),
});

export const bookmarks = appSchema.table("bookmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id"),
  conceptId: text("concept_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = appSchema.table("notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collections = appSchema.table("collections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionAttempts = appSchema.table("question_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  responseText: text("response_text"),
  correctness: doublePrecision("correctness"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const confidenceRatings = appSchema.table("confidence_ratings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  rating: integer("rating").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const masteryRecords = appSchema.table("mastery_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id"),
  conceptId: text("concept_id"),
  mastery: doublePrecision("mastery").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studySessions = appSchema.table("study_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  firmId: text("firm_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json").notNull().default({}),
});

export const studySessionQuestions = appSchema.table("study_session_questions", {
  sessionId: text("session_id").notNull(),
  questionId: text("question_id").notNull(),
  position: integer("position").notNull().default(0),
});

export const studyPlans = appSchema.table("study_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  planJson: jsonb("plan_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewQueue = appSchema.table("review_queue", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
