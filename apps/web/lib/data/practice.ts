/**
 * Practice session stubs — in-memory when DB/auth unavailable; DB insert when ready.
 * Does not run scrapes.
 */
import { randomUUID } from "node:crypto";
import { PracticeSessionSchema, type PracticeSession } from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import type {
  CreatePracticeSessionRequest,
  PracticeSessionResponse,
} from "@/lib/api/schemas";
import { listQuestions } from "@/lib/data/questions";

const stubSessions = new Map<string, PracticeSession>();

function modeToDb(mode: CreatePracticeSessionRequest["mode"]): string {
  return mode;
}

export async function createPracticeSession(options: {
  userId: string;
  input: CreatePracticeSessionRequest;
}): Promise<PracticeSessionResponse> {
  const { userId, input } = options;
  let questionIds = [...input.question_ids];

  if (questionIds.length === 0) {
    const listed = await listQuestions({
      limit: input.limit,
      offset: 0,
      track: undefined,
    });
    questionIds = listed.items.slice(0, input.limit).map((q) => q.id);
  }

  const startedAt = new Date().toISOString();
  const sessionId = `sess_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const session = PracticeSessionSchema.parse({
    id: sessionId,
    user_id: userId,
    mode: input.mode,
    learning_mode: input.learning_mode,
    firm_ids: input.firm_ids,
    concept_ids: input.concept_ids,
    question_ids: questionIds,
    started_at: startedAt,
    completed_at: null,
    metadata: { stub: !isDatabaseConfigured() },
  });

  if (!isDatabaseConfigured()) {
    stubSessions.set(sessionId, session);
    return {
      session,
      source: "stub",
      note: "In-memory practice session (DATABASE_URL unset).",
    };
  }

  const sql = requireSql();
  try {
    await withRlsUserId(sql, userId, (s) => [
      s`
        INSERT INTO app.users (id, neon_auth_user_id)
        VALUES (${userId}, ${userId})
        ON CONFLICT (neon_auth_user_id) DO NOTHING
      `,
      s`
        INSERT INTO app.study_sessions (id, user_id, mode, firm_id, started_at, metadata_json)
        VALUES (
          ${sessionId},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${modeToDb(input.mode)},
          ${input.firm_ids[0] ?? null},
          ${startedAt}::timestamptz,
          ${JSON.stringify({
            learning_mode: input.learning_mode ?? null,
            firm_ids: input.firm_ids,
            concept_ids: input.concept_ids,
            question_ids: questionIds,
          })}::jsonb
        )
      `,
    ]);
    return { session, source: "published" };
  } catch (err) {
    console.warn("[practice] DB insert failed; returning stub session", err);
    stubSessions.set(sessionId, session);
    return {
      session,
      source: "stub",
      note: "DB write failed — returned ephemeral session.",
    };
  }
}

export async function getPracticeSession(
  sessionId: string,
): Promise<PracticeSession | null> {
  const mem = stubSessions.get(sessionId);
  if (mem) return mem;
  if (!isDatabaseConfigured()) return null;

  const sql = requireSql();
  const rows = (await sql`
    SELECT id, user_id, mode, firm_id, started_at, completed_at, metadata_json
    FROM app.study_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `) as {
    id: string;
    user_id: string;
    mode: string;
    firm_id: string | null;
    started_at: string;
    completed_at: string | null;
    metadata_json: Record<string, unknown>;
  }[];

  const row = rows[0];
  if (!row) return null;
  const meta = row.metadata_json ?? {};
  return PracticeSessionSchema.parse({
    id: row.id,
    user_id: row.user_id,
    mode: row.mode,
    learning_mode: meta.learning_mode,
    firm_ids: (meta.firm_ids as string[]) ?? (row.firm_id ? [row.firm_id] : []),
    concept_ids: (meta.concept_ids as string[]) ?? [],
    question_ids: (meta.question_ids as string[]) ?? [],
    started_at: new Date(row.started_at).toISOString(),
    completed_at: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    metadata: meta,
  });
}
