import { MasterySchema, type Mastery } from "@ibpe/contracts";
import type { MasteryListResponse } from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { levelFromScore } from "@/lib/grading/mastery";
import { conceptIdForTopic } from "@/lib/topics";
import { getStubMastery } from "./attempts";

export {
  WEAK_THRESHOLD,
  weakTopicsFromMastery,
  type WeakTopic,
} from "@/lib/weak-topics";
export { levelFromScore };

type MasteryRow = {
  question_id: string | null;
  concept_id: string | null;
  mastery: number;
  updated_at: string;
  topic: string | null;
  attempt_count: number | null;
  last_attempt_at: string | null;
  next_review_at: string | null;
};

function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function minIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[0] ?? null;
}

function maxIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[present.length - 1] ?? null;
}

/**
 * Map DB rows to Mastery. Question rows carry their own attempt count and
 * review due date; concept rows aggregate the questions that roll up into
 * them (sum of attempts, earliest due review, latest attempt).
 */
export function masteryRowsToItems(rows: MasteryRow[], neonUserId: string): Mastery[] {
  const questionRows = rows.filter((row) => row.question_id);
  const byConcept = new Map<string, MasteryRow[]>();
  for (const row of questionRows) {
    const conceptId = row.topic ? conceptIdForTopic(row.topic) : null;
    if (!conceptId) continue;
    const list = byConcept.get(conceptId) ?? [];
    list.push(row);
    byConcept.set(conceptId, list);
  }
  return rows.map((row) => {
    const score = Number(row.mastery);
    if (row.question_id) {
      return MasterySchema.parse({
        user_id: neonUserId,
        subject_type: "canonical_question",
        subject_id: row.question_id,
        level: levelFromScore(score, Number(row.attempt_count ?? 0) > 0),
        score,
        attempt_count: Number(row.attempt_count ?? 0),
        last_attempt_at: iso(row.last_attempt_at),
        next_review_at: iso(row.next_review_at),
        firm_id: null,
        updated_at: new Date(row.updated_at).toISOString(),
      });
    }
    const members = byConcept.get(row.concept_id ?? "") ?? [];
    return MasterySchema.parse({
      user_id: neonUserId,
      subject_type: "concept",
      subject_id: row.concept_id ?? "unknown",
      level: levelFromScore(score, members.length > 0),
      score,
      attempt_count: members.reduce((sum, m) => sum + Number(m.attempt_count ?? 0), 0),
      last_attempt_at: maxIso(members.map((m) => iso(m.last_attempt_at))),
      next_review_at: minIso(members.map((m) => iso(m.next_review_at))),
      firm_id: null,
      updated_at: new Date(row.updated_at).toISOString(),
    });
  });
}

export async function listMastery(userId: string): Promise<MasteryListResponse> {
  if (!isDatabaseConfigured()) {
    return { items: getStubMastery(userId), source: "stub" };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT
          m.question_id,
          m.concept_id,
          m.mastery,
          m.updated_at,
          q.topic,
          att.attempt_count,
          att.last_attempt_at,
          rq.due_at AS next_review_at
        FROM app.mastery_records m
        JOIN app.users u ON u.id = m.user_id
        LEFT JOIN canonical.canonical_questions q ON q.id = m.question_id
        LEFT JOIN app.review_queue rq
          ON rq.user_id = m.user_id AND rq.question_id = m.question_id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS attempt_count, max(a.created_at) AS last_attempt_at
          FROM app.question_attempts a
          WHERE a.user_id = m.user_id
            AND a.question_id = m.question_id
            AND a.score_source IS DISTINCT FROM 'reveal_copy'
        ) att ON m.question_id IS NOT NULL
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY m.updated_at DESC
        LIMIT 250
      `,
    ]);
    const rows = (results[0] ?? []) as MasteryRow[];
    return { items: masteryRowsToItems(rows, userId), source: "published" };
  } catch (err) {
    console.warn("[mastery] DB read failed; using stub mastery", err);
    return { items: getStubMastery(userId), source: "stub" };
  }
}
