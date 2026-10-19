/**
 * Spaced review queue (§10.9) — one scheduled row per user × question.
 * DB when configured (app.review_queue, migration 041); in-memory otherwise.
 */
import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import {
  scheduleReview,
  type ReviewRating,
  type ReviewState,
} from "@/lib/review-schedule";
import { ensureAppUserQuery } from "./users";
import { memoryStore } from "./memory-store";

/**
 * Rating glue for graded attempts: explicit button → graded score → self
 * confidence; null (skip scheduling) for reveal-copy answers.
 */
export { ratingForAttempt, ratingFromGrade } from "@/lib/grading/review-rating";

export type ReviewItem = {
  question_id: string;
  due_at: string;
  interval_days: number;
  ease: number;
  repetitions: number;
  last_rating: ReviewRating | null;
  updated_at: string;
};

export type DueReviews = {
  items: ReviewItem[];
  due_count: number;
  scheduled_count: number;
  next_due_at: string | null;
  source: "published" | "stub";
};

const stubReviews = memoryStore<string, Map<string, ReviewItem>>("review_queue");

function stubFor(userId: string): Map<string, ReviewItem> {
  let items = stubReviews.get(userId);
  if (!items) {
    items = new Map();
    stubReviews.set(userId, items);
  }
  return items;
}

type ReviewRow = {
  question_id: string;
  due_at: string;
  interval_days: number;
  ease: number;
  repetitions: number;
  last_rating: string | null;
  updated_at: string;
};

function rowToItem(row: ReviewRow): ReviewItem {
  return {
    question_id: row.question_id,
    due_at: new Date(row.due_at).toISOString(),
    interval_days: Number(row.interval_days),
    ease: Number(row.ease),
    repetitions: Number(row.repetitions),
    last_rating: (row.last_rating as ReviewRating | null) ?? null,
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function recordStub(userId: string, questionId: string, rating: ReviewRating, now: Date) {
  const items = stubFor(userId);
  const next = scheduleReview(items.get(questionId) ?? null, rating, now);
  const item: ReviewItem = {
    question_id: questionId,
    ...next,
    updated_at: now.toISOString(),
  };
  items.set(questionId, item);
  return item;
}

/** Apply a rating to the question's schedule and persist the new due date. */
export async function recordReview(options: {
  userId: string;
  email?: string | null;
  questionId: string;
  rating: ReviewRating;
  now?: Date;
}): Promise<{ item: ReviewItem; source: "published" | "stub" }> {
  const { userId, email, questionId, rating } = options;
  const now = options.now ?? new Date();

  if (!isDatabaseConfigured()) {
    return { item: recordStub(userId, questionId, rating, now), source: "stub" };
  }

  try {
    const sql = requireSql();
    const existing = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT rq.interval_days, rq.ease, rq.repetitions
        FROM app.review_queue rq
        JOIN app.users u ON u.id = rq.user_id
        WHERE u.neon_auth_user_id = ${userId} AND rq.question_id = ${questionId}
        LIMIT 1
      `,
    ]);
    const prevRow = ((existing[0] ?? []) as ReviewState[])[0];
    const prev: ReviewState | null = prevRow
      ? {
          interval_days: Number(prevRow.interval_days),
          ease: Number(prevRow.ease),
          repetitions: Number(prevRow.repetitions),
        }
      : null;
    const next = scheduleReview(prev, rating, now);
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.review_queue (
          id, user_id, question_id, due_at, interval_days, ease, repetitions, last_rating, updated_at
        )
        VALUES (
          ${`rv_${randomUUID().replace(/-/g, "").slice(0, 24)}`},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${questionId},
          ${next.due_at}::timestamptz,
          ${next.interval_days},
          ${next.ease},
          ${next.repetitions},
          ${next.last_rating},
          ${now.toISOString()}::timestamptz
        )
        ON CONFLICT (user_id, question_id) DO UPDATE SET
          due_at = EXCLUDED.due_at,
          interval_days = EXCLUDED.interval_days,
          ease = EXCLUDED.ease,
          repetitions = EXCLUDED.repetitions,
          last_rating = EXCLUDED.last_rating,
          updated_at = EXCLUDED.updated_at
      `,
    ]);
    return {
      item: { question_id: questionId, ...next, updated_at: now.toISOString() },
      source: "published",
    };
  } catch (err) {
    console.warn("[review] DB write failed; scheduling in memory", err);
    return { item: recordStub(userId, questionId, rating, now), source: "stub" };
  }
}

function summarise(
  all: ReviewItem[],
  now: Date,
  limit: number,
  source: DueReviews["source"],
): DueReviews {
  const sorted = [...all].sort((a, b) => a.due_at.localeCompare(b.due_at));
  const nowIso = now.toISOString();
  const due = sorted.filter((item) => item.due_at <= nowIso);
  const upcoming = sorted.find((item) => item.due_at > nowIso);
  return {
    items: due.slice(0, limit),
    due_count: due.length,
    scheduled_count: sorted.length,
    next_due_at: upcoming?.due_at ?? null,
    source,
  };
}

/** Due reviews (oldest first) plus counts for the dashboard badge. */
export async function listDueReviews(
  userId: string,
  options: { now?: Date; limit?: number } = {},
): Promise<DueReviews> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 20;
  const stubItems = () => [...stubFor(userId).values()];

  if (!isDatabaseConfigured()) {
    return summarise(stubItems(), now, limit, "stub");
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT rq.question_id, rq.due_at, rq.interval_days, rq.ease, rq.repetitions,
               rq.last_rating, rq.updated_at
        FROM app.review_queue rq
        JOIN app.users u ON u.id = rq.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY rq.due_at ASC
        LIMIT 500
      `,
    ]);
    const rows = (results[0] ?? []) as ReviewRow[];
    return summarise(rows.map(rowToItem), now, limit, "published");
  } catch (err) {
    console.warn("[review] DB read failed; using in-memory queue", err);
    return summarise(stubItems(), now, limit, "stub");
  }
}
