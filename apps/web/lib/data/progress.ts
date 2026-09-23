/**
 * User progress aggregates (Progress page + dashboard streak) — computed
 * from real attempts/sessions/module_progress, never fabricated.
 */
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { applyCheckpoint, streakFromDates, summariseAttempts } from "@/lib/progress-summary";
import { listStubAttempts } from "./attempts";
import { listStubSessions } from "./practice";
import { ensureAppUserQuery } from "./users";
import { memoryStore } from "./memory-store";

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
  source: z.enum(["published", "stub", "empty"]),
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

type ModuleProgressEntry = ProgressResponse["module_progress"][number];

/** userId → moduleId → completion (in-memory when DATABASE_URL is unset). */
const stubModuleProgress = memoryStore<string, Map<string, ModuleProgressEntry>>("module_progress");

function stubModulesFor(userId: string): Map<string, ModuleProgressEntry> {
  let modules = stubModuleProgress.get(userId);
  if (!modules) {
    modules = new Map();
    stubModuleProgress.set(userId, modules);
  }
  return modules;
}

/** Progress from in-memory attempts, sessions and module completion. */
function stubProgress(userId: string, note: string): ProgressResponse {
  const attempts = listStubAttempts(userId);
  const sessions = listStubSessions(userId).slice(0, 20);
  const modules = [...stubModulesFor(userId).values()];
  if (attempts.length === 0 && sessions.length === 0 && modules.length === 0) {
    return { ...EMPTY, note };
  }
  const summary = summariseAttempts(
    attempts.map((attempt) => ({
      created_at: attempt.created_at,
      correct: attempt.correct ?? null,
    })),
  );
  return ProgressResponseSchema.parse({
    ...summary,
    module_progress: modules,
    sessions: sessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      started_at: session.started_at,
      firm_id: session.firm_ids[0] ?? null,
    })),
    source: "stub",
    note,
  });
}

/**
 * Mark a module checkpoint complete (or not). `checkpointIds` is the module's
 * ordered checkpoint list; percent is stored 0–100 and served as 0–1.
 */
export async function setModuleCheckpoint(options: {
  userId: string;
  email?: string | null;
  moduleId: string;
  checkpointIds: string[];
  checkpointId: string;
  complete: boolean;
}): Promise<{ entry: ModuleProgressEntry; source: "published" | "stub" }> {
  const { userId, email, moduleId, checkpointIds, checkpointId, complete } = options;
  const toEntry = (completed: string[]) => {
    const next = applyCheckpoint(completed, checkpointIds, checkpointId, complete);
    return {
      module_id: moduleId,
      percent: next.percent / 100,
      completed_checkpoint_ids: next.completed_checkpoint_ids,
    };
  };
  const saveStub = () => {
    const modules = stubModulesFor(userId);
    const entry = toEntry(modules.get(moduleId)?.completed_checkpoint_ids ?? []);
    modules.set(moduleId, entry);
    return { entry, source: "stub" as const };
  };

  if (!isDatabaseConfigured()) return saveStub();

  try {
    const sql = requireSql();
    const existing = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT p.completed_checkpoint_ids
        FROM app.module_progress p
        JOIN app.users u ON u.id = p.user_id
        WHERE u.neon_auth_user_id = ${userId} AND p.module_id = ${moduleId}
        LIMIT 1
      `,
    ]);
    const row = ((existing[0] ?? []) as Array<{ completed_checkpoint_ids: unknown }>)[0];
    const completed = Array.isArray(row?.completed_checkpoint_ids)
      ? row.completed_checkpoint_ids.filter((id): id is string => typeof id === "string")
      : [];
    const entry = toEntry(completed);
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.module_progress (user_id, module_id, completed_checkpoint_ids, percent, updated_at)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${moduleId},
          ${JSON.stringify(entry.completed_checkpoint_ids)}::jsonb,
          ${entry.percent * 100},
          now()
        )
        ON CONFLICT (user_id, module_id) DO UPDATE SET
          completed_checkpoint_ids = EXCLUDED.completed_checkpoint_ids,
          percent = EXCLUDED.percent,
          updated_at = EXCLUDED.updated_at
      `,
    ]);
    return { entry, source: "published" };
  } catch (err) {
    console.warn("[progress] module_progress write failed; saving in memory", err);
    return saveStub();
  }
}

export async function getUserProgress(userId: string): Promise<ProgressResponse> {
  if (!isDatabaseConfigured()) {
    return stubProgress(userId, "DATABASE_URL unset — progress from this server session only.");
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
        // Stored 0–100 (column CHECK); served as a 0–1 fraction.
        percent: Math.min(1, Math.max(0, Number(row.percent) / 100)),
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
    return stubProgress(userId, "Progress read failed — showing this server session only.");
  }
}
