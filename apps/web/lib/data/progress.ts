/**
 * User progress aggregates (Progress page + dashboard streak) — computed
 * from real attempts/sessions/module_progress, never fabricated.
 */
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";

export const ProgressResponseSchema = z.object({
  activity: z.array(z.object({ date: z.string(), attempts: z.number().int() })),
  streak_days: z.number().int().nonnegative(),
  total_attempts: z.number().int().nonnegative(),
  accuracy: z.array(
    z.object({
      week: z.string(),
      accuracy: z.number().min(0).max(1).nullable(),
      attempts: z.number().int(),
    }),
  ),
  module_progress: z.array(
    z.object({
      module_id: z.string(),
      percent: z.number().min(0).max(1),
      completed_checkpoint_ids: z.array(z.string()),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      mode: z.string().nullable(),
      started_at: z.string(),
      firm_id: z.string().nullable(),
    }),
  ),
  source: z.enum(["published", "empty"]),
  note: z.string().optional(),
});
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;

const EMPTY: ProgressResponse = {
  activity: [],
  streak_days: 0,
  total_attempts: 0,
  accuracy: [],
  module_progress: [],
  sessions: [],
  source: "empty",
};

function streakFromDates(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates);
  let streak = 0;
  const cursor = new Date();
  // Today may not have activity yet — streak counts back from yesterday too.
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function getUserProgress(userId: string): Promise<ProgressResponse> {
  if (!isDatabaseConfigured()) {
    return { ...EMPTY, note: "DATABASE_URL unset." };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT created_at::date::text AS date, count(*)::int AS attempts
        FROM app.question_attempts a
        JOIN app.users u ON u.id = a.user_id
        WHERE u.neon_auth_user_id = ${userId}
          AND created_at >= now() - interval '28 days'
        GROUP BY 1
        ORDER BY 1
      `,
      s`
        SELECT
          date_trunc('week', created_at)::date::text AS week,
          count(*)::int AS attempts,
          avg(correctness)::float AS accuracy
        FROM app.question_attempts a
        JOIN app.users u ON u.id = a.user_id
        WHERE u.neon_auth_user_id = ${userId}
          AND correctness IS NOT NULL
          AND created_at >= now() - interval '84 days'
        GROUP BY 1
        ORDER BY 1
      `,
      s`
        SELECT p.module_id, p.percent, p.completed_checkpoint_ids
        FROM app.module_progress p
        JOIN app.users u ON u.id = p.user_id
        WHERE u.neon_auth_user_id = ${userId}
      `,
      s`
        SELECT sess.id, sess.mode, sess.started_at, sess.firm_id
        FROM app.study_sessions sess
        JOIN app.users u ON u.id = sess.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY sess.started_at DESC
        LIMIT 20
      `,
      s`
        SELECT count(*)::int AS n
        FROM app.question_attempts a
        JOIN app.users u ON u.id = a.user_id
        WHERE u.neon_auth_user_id = ${userId}
      `,
    ]);

    const activity = (results[0] ?? []) as Array<{ date: string; attempts: number }>;
    const accuracy = (results[1] ?? []) as Array<{
      week: string;
      attempts: number;
      accuracy: number | null;
    }>;
    const moduleRows = (results[2] ?? []) as Array<{
      module_id: string;
      percent: number | string;
      completed_checkpoint_ids: unknown;
    }>;
    const sessionRows = (results[3] ?? []) as Array<{
      id: string;
      mode: string | null;
      started_at: string;
      firm_id: string | null;
    }>;
    const totalRows = (results[4] ?? []) as Array<{ n: number }>;

    const total = totalRows[0]?.n ?? 0;
    if (total === 0 && moduleRows.length === 0 && sessionRows.length === 0) {
      return { ...EMPTY, note: "No practice history yet — complete an attempt to start progress." };
    }

    return ProgressResponseSchema.parse({
      activity,
      streak_days: streakFromDates(activity.map((row) => row.date)),
      total_attempts: total,
      accuracy: accuracy.map((row) => ({
        week: row.week,
        attempts: row.attempts,
        accuracy: row.accuracy == null ? null : Math.min(1, Math.max(0, row.accuracy)),
      })),
      module_progress: moduleRows.map((row) => ({
        module_id: row.module_id,
        percent: Math.min(1, Math.max(0, Number(row.percent))),
        completed_checkpoint_ids: Array.isArray(row.completed_checkpoint_ids)
          ? row.completed_checkpoint_ids.filter((id): id is string => typeof id === "string")
          : [],
      })),
      sessions: sessionRows.map((row) => ({
        id: row.id,
        mode: row.mode,
        started_at: new Date(row.started_at).toISOString(),
        firm_id: row.firm_id,
      })),
      source: "published",
    });
  } catch (err) {
    console.warn("[progress] DB read failed", err);
    return { ...EMPTY, note: "Progress read failed." };
  }
}
