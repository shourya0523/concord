import { randomUUID } from "node:crypto";
import {
  AttemptSchema,
  MasterySchema,
  type Attempt,
  type Mastery,
} from "@ibpe/contracts";
import type { AttemptResponse, CreateAttemptRequest } from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { getPracticeSession } from "./practice";
import { ensureAppUserQuery } from "./users";

const stubAttempts = new Map<string, Attempt[]>();
const stubMastery = new Map<string, Mastery>();

function masteryKey(userId: string, subjectType: string, subjectId: string): string {
  return `${userId}:${subjectType}:${subjectId}`;
}

function scoreFromCorrect(correct: boolean | null | undefined): number {
  if (correct === true) return 1;
  if (correct === false) return 0.25;
  return 0.5;
}

function levelFromScore(score: number): Mastery["level"] {
  if (score >= 0.85) return "mastered";
  if (score >= 0.68) return "proficient";
  if (score >= 0.45) return "familiar";
  if (score > 0) return "learning";
  return "unseen";
}

function upsertStubMastery(options: {
  userId: string;
  questionId: string;
  firmId?: string | null;
  correct?: boolean | null;
  createdAt: string;
}): Mastery {
  const key = masteryKey(options.userId, "canonical_question", options.questionId);
  const current = stubMastery.get(key);
  const attemptScore = scoreFromCorrect(options.correct);
  const attempt_count = (current?.attempt_count ?? 0) + 1;
  const score =
    current && current.attempt_count > 0
      ? (current.score * current.attempt_count + attemptScore) / attempt_count
      : attemptScore;
  const mastery = MasterySchema.parse({
    user_id: options.userId,
    subject_type: "canonical_question",
    subject_id: options.questionId,
    level: levelFromScore(score),
    score,
    attempt_count,
    last_attempt_at: options.createdAt,
    next_review_at: null,
    firm_id: options.firmId ?? null,
    updated_at: options.createdAt,
  });
  stubMastery.set(key, mastery);
  return mastery;
}

export function getStubMastery(userId: string): Mastery[] {
  return [...stubMastery.values()].filter((item) => item.user_id === userId);
}

export async function recordPracticeAttempt(options: {
  userId: string;
  email?: string | null;
  sessionId: string;
  input: CreateAttemptRequest;
}): Promise<AttemptResponse> {
  const { userId, email, sessionId, input } = options;
  const session = await getPracticeSession(sessionId, userId);
  const questionId =
    input.canonical_question_id ?? input.question_id ?? session?.question_ids[0];
  if (!questionId) {
    throw new Error("Attempt requires canonical_question_id or a session question");
  }

  const now = new Date().toISOString();
  const attempt = AttemptSchema.parse({
    id: `att_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: userId,
    session_id: sessionId,
    canonical_question_id: questionId,
    answer_id: null,
    response_text: input.response_text,
    self_score: input.correct == null ? null : scoreFromCorrect(input.correct),
    confidence: input.confidence ?? null,
    time_spent_ms: input.time_spent_ms ?? null,
    correct: input.correct ?? null,
    weak_topics: [],
    firm_id: session?.firm_ids[0] ?? null,
    created_at: now,
  });

  if (!isDatabaseConfigured()) {
    const attempts = stubAttempts.get(sessionId) ?? [];
    attempts.unshift(attempt);
    stubAttempts.set(sessionId, attempts);
    const mastery = upsertStubMastery({
      userId,
      questionId,
      firmId: attempt.firm_id,
      correct: input.correct,
      createdAt: now,
    });
    return {
      attempt,
      mastery,
      source: "stub",
      note: "DATABASE_URL unset — saved attempt/mastery in memory.",
    };
  }

  try {
    const sql = requireSql();
    const correctness =
      input.correct == null ? null : input.correct === true ? 1 : 0;
    const masteryScore = scoreFromCorrect(input.correct);
    const queries = [
      ensureAppUserQuery(sql, userId, email),
      sql`
        INSERT INTO app.question_attempts (id, user_id, question_id, response_text, correctness)
        VALUES (
          ${attempt.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${questionId},
          ${input.response_text ?? null},
          ${correctness}
        )
      `,
      sql`
        INSERT INTO app.mastery_records (id, user_id, question_id, mastery, updated_at)
        VALUES (
          ${`m_${randomUUID().replace(/-/g, "").slice(0, 24)}`},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${questionId},
          ${masteryScore},
          ${now}::timestamptz
        )
        ON CONFLICT (user_id, question_id) WHERE question_id IS NOT NULL DO UPDATE SET
          mastery = ((app.mastery_records.mastery + EXCLUDED.mastery) / 2),
          updated_at = EXCLUDED.updated_at
      `,
    ];
    await withRlsUserId(sql, userId, () => queries);
    const mastery = upsertStubMastery({
      userId,
      questionId,
      firmId: attempt.firm_id,
      correct: input.correct,
      createdAt: now,
    });
    return {
      attempt,
      mastery,
      source: "published",
      note:
        "Attempt saved to app.question_attempts; response-only fields kept in API payload until DB schema expands.",
    };
  } catch (err) {
    console.warn("[attempts] DB write failed; saving attempt in memory", err);
    const attempts = stubAttempts.get(sessionId) ?? [];
    attempts.unshift(attempt);
    stubAttempts.set(sessionId, attempts);
    const mastery = upsertStubMastery({
      userId,
      questionId,
      firmId: attempt.firm_id,
      correct: input.correct,
      createdAt: now,
    });
    return {
      attempt,
      mastery,
      source: "stub",
      note: "DB attempt write failed — saved attempt/mastery in memory.",
    };
  }
}
