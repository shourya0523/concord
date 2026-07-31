import { MasterySchema, type Mastery } from "@ibpe/contracts";
import type { MasteryListResponse } from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { topicForConceptId } from "@/lib/topics";
import { getStubMastery } from "./attempts";

type MasteryRow = {
  user_id: string;
  question_id: string | null;
  concept_id: string | null;
  mastery: number;
  updated_at: string;
};

function levelFromScore(score: number): Mastery["level"] {
  if (score >= 0.85) return "mastered";
  if (score >= 0.68) return "proficient";
  if (score >= 0.45) return "familiar";
  if (score > 0) return "learning";
  return "unseen";
}

function rowToMastery(row: MasteryRow, neonUserId: string): Mastery {
  const subject_type = row.question_id ? "canonical_question" : "concept";
  const subject_id = row.question_id ?? row.concept_id ?? "unknown";
  return MasterySchema.parse({
    user_id: neonUserId,
    subject_type,
    subject_id,
    level: levelFromScore(Number(row.mastery)),
    score: Number(row.mastery),
    attempt_count: 0,
    last_attempt_at: null,
    next_review_at: null,
    firm_id: null,
    updated_at: new Date(row.updated_at).toISOString(),
  });
}

export type WeakTopic = {
  topic: string;
  concept_id: string | null;
  score: number;
  reason: string;
};

export const WEAK_THRESHOLD = 0.68;

/**
 * Weak topics derived from real mastery records (concept-level), never a
 * hardcoded list. Empty for new users — onboarding/flows must handle that.
 */
export function weakTopicsFromMastery(items: Mastery[]): WeakTopic[] {
  const byTopic = new Map<string, WeakTopic>();
  for (const item of items) {
    if (item.subject_type !== "concept" || item.score >= WEAK_THRESHOLD) continue;
    const topic = topicForConceptId(item.subject_id);
    if (!topic) continue;
    const existing = byTopic.get(topic);
    if (existing && existing.score <= item.score) continue;
    byTopic.set(topic, {
      topic,
      concept_id: item.subject_id,
      score: item.score,
      reason: `Mastery ${Math.round(item.score * 100)}% — below proficient (${WEAK_THRESHOLD * 100}%)`,
    });
  }
  return [...byTopic.values()].sort((a, b) => a.score - b.score);
}

export async function listMastery(userId: string): Promise<MasteryListResponse> {
  if (!isDatabaseConfigured()) {
    return { items: getStubMastery(userId), source: "stub" };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT m.user_id, m.question_id, m.concept_id, m.mastery, m.updated_at
        FROM app.mastery_records m
        JOIN app.users u ON u.id = m.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY m.updated_at DESC
        LIMIT 250
      `,
    ]);
    const rows = (results[0] ?? []) as MasteryRow[];
    return {
      items: rows.map((row) => rowToMastery(row, userId)),
      source: "published",
    };
  } catch (err) {
    console.warn("[mastery] DB read failed; using stub mastery", err);
    return { items: getStubMastery(userId), source: "stub" };
  }
}
