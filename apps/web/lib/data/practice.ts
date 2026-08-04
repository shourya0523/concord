/**
 * Practice sessions — mode-specific packs, firm context snapshot, DB or stub.
 */
import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import {
  PracticeSessionSchema,
  normalizePracticeMode,
  type PracticeSession,
  type PracticeSessionMode,
} from "@ibpe/contracts";
import type {
  CreatePracticeSessionRequest,
  PracticeSessionResponse,
} from "@/lib/api/schemas";
import { buildPracticePack } from "@/lib/data/practice-packs";
import { ensureAppUserQuery } from "./users";

const stubSessions = new Map<string, PracticeSession>();

function practiceModeToDb(mode: PracticeSessionMode): string {
  return mode;
}

function simulatorStageTemplate() {
  return {
    ib: [
      { id: "ib_fit", label: "Fit / motivation", minutes: 8 },
      { id: "ib_accounting", label: "Accounting technicals", minutes: 12 },
      { id: "ib_valuation", label: "Valuation and DCF", minutes: 15 },
      { id: "ib_deal_judgement", label: "Market / deal judgement", minutes: 10 },
    ],
    pe: [
      { id: "pe_fit", label: "Investing fit", minutes: 8 },
      { id: "pe_lbo", label: "LBO and returns", minutes: 15 },
      { id: "pe_ic", label: "Investment committee judgement", minutes: 12 },
      { id: "pe_portfolio", label: "Portfolio operations", minutes: 10 },
    ],
  };
}

export async function createPracticeSession(options: {
  userId: string;
  input: CreatePracticeSessionRequest;
}): Promise<PracticeSessionResponse> {
  const { userId, input } = options;
  const mode = normalizePracticeMode(input.mode);
  const pack = await buildPracticePack({
    userId,
    input: { ...input, mode },
  });
  const questionIds = pack.question_ids;

  const startedAt = new Date().toISOString();
  const sessionId = `sess_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const metadata = {
    learning_mode: input.learning_mode ?? null,
    firm_ids: input.firm_ids,
    concept_ids: input.concept_ids,
    question_ids: questionIds,
    practice_mode: mode,
    firm_context_snapshot: pack.firm_context_snapshot,
    pack_notes: pack.firm_context_snapshot.notes,
    ...(mode === "simulator"
      ? {
          simulator: {
            stage_template: simulatorStageTemplate(),
            stage_topic_map: pack.stage_topic_map ?? {},
            note: "Stages biased by firm heat topics when available.",
          },
        }
      : {}),
  };

  const session = PracticeSessionSchema.parse({
    id: sessionId,
    user_id: userId,
    mode,
    learning_mode: input.learning_mode,
    firm_ids: input.firm_ids,
    concept_ids: input.concept_ids,
    question_ids: questionIds,
    started_at: startedAt,
    completed_at: null,
    metadata: { ...metadata, stub: !isDatabaseConfigured() },
  });

  const noteParts = [
    `mode=${mode}`,
    `pack=${pack.firm_context_snapshot.pack_backend ?? "n/a"}`,
    ...pack.firm_context_snapshot.notes.slice(0, 2),
  ];

  if (!isDatabaseConfigured()) {
    stubSessions.set(sessionId, session);
    return {
      session,
      source: "stub",
      note: `In-memory practice session (DATABASE_URL unset). ${noteParts.join("; ")}`,
    };
  }

  const sql = requireSql();
  try {
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId),
      s`
        INSERT INTO app.study_sessions (id, user_id, mode, firm_id, started_at, metadata_json)
        VALUES (
          ${sessionId},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${practiceModeToDb(mode)},
          ${input.firm_ids[0] ?? null},
          ${startedAt}::timestamptz,
          ${JSON.stringify(metadata)}::jsonb
        )
      `,
    ]);
    return {
      session,
      source: "published",
      note: noteParts.join("; "),
    };
  } catch (err) {
    console.warn("[practice] DB insert failed; returning stub session", err);
    const stubSession = PracticeSessionSchema.parse({
      ...session,
      metadata: { ...session.metadata, stub: true },
    });
    stubSessions.set(sessionId, stubSession);
    return {
      session: stubSession,
      source: "stub",
      note: `DB write failed — ephemeral session. ${noteParts.join("; ")}`,
    };
  }
}

export async function getPracticeSession(
  sessionId: string,
  userId?: string,
): Promise<PracticeSession | null> {
  const mem = stubSessions.get(sessionId);
  if (mem) return mem;
  if (!isDatabaseConfigured()) return null;

  const sql = requireSql();
  type SessionRow = {
    id: string;
    user_id: string;
    mode: string;
    firm_id: string | null;
    started_at: string;
    completed_at: string | null;
    metadata_json: Record<string, unknown>;
  };
  let rows: SessionRow[];
  if (userId) {
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT id, user_id, mode, firm_id, started_at, completed_at, metadata_json
        FROM app.study_sessions
        WHERE id = ${sessionId}
        LIMIT 1
      `,
    ]);
    rows = (results[0] ?? []) as SessionRow[];
  } else {
    rows = (await sql`
      SELECT id, user_id, mode, firm_id, started_at, completed_at, metadata_json
      FROM app.study_sessions
      WHERE id = ${sessionId}
      LIMIT 1
    `) as SessionRow[];
  }

  const row = rows[0];
  if (!row) return null;
  const meta = row.metadata_json ?? {};
  const mode = normalizePracticeMode(
    typeof meta.practice_mode === "string"
      ? meta.practice_mode
      : row.mode === "company_prep"
        ? "company"
        : row.mode === "concept_learn"
          ? "concept"
          : row.mode,
  );
  return PracticeSessionSchema.parse({
    id: row.id,
    user_id: row.user_id,
    mode,
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
