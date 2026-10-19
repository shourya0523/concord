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

export const targetCompanySets = appSchema.table("target_company_sets", {
  userId: text("user_id").primaryKey(),
  firmIds: jsonb("firm_ids").notNull().default([]),
  primaryFirmId: text("primary_firm_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

export const collectionItems = appSchema.table("collection_items", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull(),
  questionId: text("question_id"),
  conceptId: text("concept_id"),
  moduleId: text("module_id"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionAttempts = appSchema.table("question_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: text("question_id").notNull(),
  responseText: text("response_text"),
  correctness: doublePrecision("correctness"),
  sessionId: text("session_id"),
  score: doublePrecision("score"),
  scoreSource: text("score_source"),
  gradeJson: jsonb("grade_json").notNull().default({}),
  confidence: doublePrecision("confidence"),
  timeSpentMs: integer("time_spent_ms"),
  graderVersion: text("grader_version"),
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

export const moduleProgress = appSchema.table(
  "module_progress",
  {
    userId: text("user_id").notNull(),
    moduleId: text("module_id").notNull(),
    completedCheckpointIds: jsonb("completed_checkpoint_ids").notNull().default([]),
    percent: doublePrecision("percent").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.moduleId] })],
);

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
  intervalDays: doublePrecision("interval_days").notNull().default(0),
  ease: doublePrecision("ease").notNull().default(2.5),
  repetitions: integer("repetitions").notNull().default(0),
  lastRating: text("last_rating"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---- 043–046: learning loop (plan 2026-09-23-001) ---- */

export const drillAttempts = appSchema.table("drill_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  templateId: text("template_id").notNull(),
  seed: text("seed").notNull(),
  conceptId: text("concept_id"),
  topic: text("topic"),
  responseText: text("response_text"),
  responseValue: doublePrecision("response_value"),
  expectedValue: doublePrecision("expected_value").notNull(),
  score: doublePrecision("score").notNull(),
  correct: boolean("correct").notNull(),
  timeSpentMs: integer("time_spent_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailySets = appSchema.table(
  "daily_sets",
  {
    userId: text("user_id").notNull(),
    localDate: date("local_date").notNull(),
    itemsJson: jsonb("items_json").notNull().default([]),
    goal: integer("goal").notNull(),
    completedCount: integer("completed_count").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

export const dailyActivity = appSchema.table(
  "daily_activity",
  {
    userId: text("user_id").notNull(),
    localDate: date("local_date").notNull(),
    cardsDone: integer("cards_done").notNull().default(0),
    goal: integer("goal").notNull().default(8),
    goalMet: boolean("goal_met").notNull().default(false),
    xp: integer("xp").notNull().default(0),
    freezeUsed: boolean("freeze_used").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

export const userStreaks = appSchema.table("user_streaks", {
  userId: text("user_id").primaryKey(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  freezes: integer("freezes").notNull().default(0),
  lastGoalDate: date("last_goal_date"),
  xpTotal: integer("xp_total").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readinessSnapshots = appSchema.table(
  "readiness_snapshots",
  {
    userId: text("user_id").notNull(),
    firmId: text("firm_id").notNull(),
    localDate: date("local_date").notNull(),
    readiness: doublePrecision("readiness").notNull(),
    detailJson: jsonb("detail_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.firmId, t.localDate] })],
);

/** Learning-activity ledger (migration 054): XP repeat rule + achievement counters. */
export const activityEvents = appSchema.table("activity_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  subjectId: text("subject_id"),
  score: doublePrecision("score"),
  scoreSource: text("score_source"),
  countsTowardGoal: boolean("counts_toward_goal").notNull().default(false),
  xp: integer("xp").notNull().default(0),
  localDate: date("local_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = appSchema.table(
  "user_achievements",
  {
    userId: text("user_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    detailJson: jsonb("detail_json").notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

export const notificationLog = appSchema.table("notification_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  channel: text("channel").notNull(),
  localDate: date("local_date").notNull(),
  status: text("status").notNull().default("sent"),
  detailJson: jsonb("detail_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = appSchema.table("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leagueMemberships = appSchema.table(
  "league_memberships",
  {
    userId: text("user_id").notNull(),
    weekStart: date("week_start").notNull(),
    leagueId: text("league_id").notNull(),
    handle: text("handle").notNull(),
    cohort: text("cohort"),
    xp: integer("xp").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);
