/**
 * Server-side loaders for the simulator after-action report (P5.8): the
 * session's graded attempts from app.question_attempts (grade_json) when a
 * database is configured, otherwise the grades the client sends back.
 */
import type { MockReportRequest, MockReportPayload } from "@/lib/api/grading-ui-schemas";
import type { PracticeSession } from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import type { FirmContextSnapshot } from "@/lib/data/practice-packs";

import { generateCoaching, type CoachGenerate } from "./coach";
import {
  allowedCitations,
  buildMockReport,
  type HeatTopicInput,
  type ReportAttempt,
  type ReportStageInput,
} from "./report";

type AttemptRow = {
  question_id: string;
  score: number | string | null;
  score_source: string | null;
  grade_json: Record<string, unknown> | null;
  created_at: string | Date | null;
  topic: string | null;
};

function asNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asCitations(value: unknown): ReportAttempt["citations"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.kind !== "string") return [];
    return [{ id: c.id, kind: c.kind, label: typeof c.label === "string" ? c.label : undefined }];
  });
}

/** Map one DB row (grade_json written by the grader) to a report attempt. */
export function attemptFromRow(row: AttemptRow): ReportAttempt {
  const grade = row.grade_json ?? {};
  return {
    question_id: row.question_id,
    score: asNumber(row.score) ?? asNumber(grade.score),
    score_source:
      row.score_source ?? (typeof grade.score_source === "string" ? grade.score_source : null),
    feedback: typeof grade.feedback === "string" ? grade.feedback : null,
    weak_topics: asStrings(grade.weak_topics),
    citations: asCitations(grade.citations),
    topic: row.topic,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? null),
  };
}

export async function loadSessionAttemptsFromDb(
  sessionId: string,
  userId: string,
): Promise<ReportAttempt[]> {
  const sql = requireSql();
  const results = await withRlsUserId(sql, userId, (s) => [
    s`
      SELECT qa.question_id, qa.score, qa.score_source, qa.grade_json, qa.created_at, cq.topic
      FROM app.question_attempts qa
      JOIN app.users u ON u.id = qa.user_id
      LEFT JOIN canonical.canonical_questions cq ON cq.id = qa.question_id
      WHERE qa.session_id = ${sessionId}
        AND u.neon_auth_user_id = ${userId}
      ORDER BY qa.created_at ASC
      LIMIT 64
    `,
  ]);
  return ((results[0] ?? []) as AttemptRow[]).map(attemptFromRow);
}

/** Client-held grades → report attempts (no-DB path). */
export function attemptsFromRequest(body: MockReportRequest): ReportAttempt[] {
  const base = Date.parse("2000-01-01T00:00:00Z");
  let tick = 0;
  return body.stages.flatMap((stage) =>
    stage.question_id
      ? stage.grades.map((grade) => ({
          question_id: stage.question_id as string,
          score: grade.score,
          score_source: grade.score_source,
          feedback: grade.feedback ?? null,
          weak_topics: grade.weak_topics,
          citations: grade.citations,
          topic: stage.topic ?? null,
          created_at: new Date(base + tick++ * 1000).toISOString(),
        }))
      : [],
  );
}

type StageTemplateRow = { id: string; label: string };

/** Stages from the request, else from the session's simulator metadata. */
export function reportStages(body: MockReportRequest, session: PracticeSession | null): ReportStageInput[] {
  const simulator = (session?.metadata?.simulator ?? null) as {
    stage_template?: Record<string, StageTemplateRow[]>;
    stage_topic_map?: Record<string, string[]>;
  } | null;
  const templates = Object.values(simulator?.stage_template ?? {}).flat();
  const labelFor = (id: string) => templates.find((row) => row.id === id)?.label ?? id.replace(/_/g, " ");
  if (body.stages.length > 0) {
    return body.stages.map((stage) => ({
      id: stage.stage_id,
      label: stage.label ?? labelFor(stage.stage_id),
      question_id: stage.question_id ?? null,
      topic: stage.topic ?? null,
    }));
  }
  return Object.keys(simulator?.stage_topic_map ?? {}).map((id) => ({ id, label: labelFor(id) }));
}

export function heatFromSession(session: PracticeSession | null): HeatTopicInput[] {
  const raw = session?.metadata?.firm_context_snapshot as FirmContextSnapshot | undefined;
  if (!raw || !Array.isArray(raw.heat_topics)) return [];
  return raw.heat_topics.filter(
    (row) => typeof row.firm_id === "string" && typeof row.topic_id === "string",
  );
}

export async function buildSessionReport(options: {
  sessionId: string;
  userId: string;
  session: PracticeSession | null;
  body: MockReportRequest;
  deps?: { env?: NodeJS.ProcessEnv; generate?: CoachGenerate; dbAttempts?: ReportAttempt[] };
}): Promise<MockReportPayload> {
  const { sessionId, userId, session, body } = options;
  let attempts: ReportAttempt[] = [];
  let attemptsSource: MockReportPayload["attempts_source"] = "none";

  if (options.deps?.dbAttempts) {
    attempts = options.deps.dbAttempts;
    attemptsSource = "database";
  } else if (isDatabaseConfigured() && session?.metadata?.stub !== true) {
    try {
      attempts = await loadSessionAttemptsFromDb(sessionId, userId);
      attemptsSource = "database";
    } catch (err) {
      console.warn("[simulator-report] attempt query failed; using request grades", err);
    }
  }
  if (attempts.length === 0) {
    const fromBody = attemptsFromRequest(body);
    if (fromBody.length > 0) {
      attempts = fromBody;
      attemptsSource = "request";
    }
  }

  const heatTopics = heatFromSession(session);
  const report = buildMockReport({
    stages: reportStages(body, session),
    attempts,
    heatTopics,
    firmName: body.firm_name ?? null,
  });

  const coaching = await generateCoaching(
    { report, allowed: allowedCitations({ attempts, heatTopics }), firmName: body.firm_name },
    { env: options.deps?.env, generate: options.deps?.generate },
  );

  const citations = [...report.citations];
  if (coaching) {
    const allowed = allowedCitations({ attempts, heatTopics });
    for (const id of coaching.citation_ids) {
      if (citations.some((c) => c.id === id)) continue;
      const found = allowed.find((c) => c.id === id);
      if (found) citations.push(found);
    }
  }

  return {
    session_id: sessionId,
    ...report,
    summary: coaching?.text ?? report.summary,
    summary_source: coaching ? "llm" : "deterministic",
    deterministic_summary: report.summary,
    citations,
    attempts_source: attemptsSource,
  };
}
