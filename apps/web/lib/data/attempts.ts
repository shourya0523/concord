import { randomUUID } from "node:crypto";
import {
  AttemptSchema,
  MasterySchema,
  type Attempt,
  type Mastery,
} from "@ibpe/contracts";
import type {
  AttemptGradeResponse,
  AttemptResponse,
  CreateAttemptRequest,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import {
  gradePracticeAttempt,
  type GradedPracticeAttempt,
} from "@/lib/data/practice-grade";
import type { FirmContextSnapshot } from "@/lib/data/practice-packs";
import {
  conceptMastery,
  levelFromScore,
  MASTERY_EMA_ALPHA,
  nextQuestionMastery,
} from "@/lib/grading/mastery";
import { conceptIdForTopic } from "@/lib/topics";
import { recordLearningActivity } from "./activity";
import { getPracticeSession } from "./practice";
import { ratingForAttempt, recordReview } from "./review";
import { ensureAppUserQuery } from "./users";
import { memoryStore } from "./memory-store";

const stubAttempts = memoryStore<string, Attempt[]>("attempts");
const stubMastery = memoryStore<string, Mastery>("mastery");
/** question id → topic slug, so the in-memory concept roll-up matches the DB one. */
const stubQuestionTopics = memoryStore<string, string>("question_topics");

function masteryKey(userId: string, subjectType: string, subjectId: string): string {
  return `${userId}:${subjectType}:${subjectId}`;
}

export { levelFromScore };

/** Concept ids a question rolls up into (topic → concept mapping in lib/topics.ts). */
export function conceptIdsForTopic(topic: string | null | undefined): string[] {
  if (!topic) return [];
  const conceptId = conceptIdForTopic(topic);
  return conceptId ? [conceptId] : [];
}

function upsertStubMastery(options: {
  userId: string;
  questionId: string;
  topic: string | null;
  firmId?: string | null;
  score: number;
  createdAt: string;
}): { question: Mastery; concepts: Mastery[] } {
  const key = masteryKey(options.userId, "canonical_question", options.questionId);
  const current = stubMastery.get(key);
  const score = nextQuestionMastery(current?.score ?? null, options.score);
  const question = MasterySchema.parse({
    user_id: options.userId,
    subject_type: "canonical_question",
    subject_id: options.questionId,
    level: levelFromScore(score, true),
    score,
    attempt_count: (current?.attempt_count ?? 0) + 1,
    last_attempt_at: options.createdAt,
    next_review_at: current?.next_review_at ?? null,
    firm_id: options.firmId ?? null,
    updated_at: options.createdAt,
  });
  stubMastery.set(key, question);
  if (options.topic) stubQuestionTopics.set(options.questionId, options.topic);

  const concepts: Mastery[] = [];
  for (const conceptId of conceptIdsForTopic(options.topic)) {
    const members = getStubMastery(options.userId).filter(
      (m) =>
        m.subject_type === "canonical_question" &&
        conceptIdsForTopic(stubQuestionTopics.get(m.subject_id)).includes(conceptId),
    );
    const mean = conceptMastery(members.map((m) => m.score));
    if (mean == null) continue;
    const concept = MasterySchema.parse({
      user_id: options.userId,
      subject_type: "concept",
      subject_id: conceptId,
      level: levelFromScore(mean, true),
      score: mean,
      attempt_count: members.reduce((sum, m) => sum + m.attempt_count, 0),
      last_attempt_at: options.createdAt,
      next_review_at: null,
      firm_id: null,
      updated_at: options.createdAt,
    });
    stubMastery.set(masteryKey(options.userId, "concept", conceptId), concept);
    concepts.push(concept);
  }
  return { question, concepts };
}

/** In-memory attempts for one user (no-DB progress aggregates). */
export function listStubAttempts(userId: string): Attempt[] {
  return [...stubAttempts.values()].flat().filter((item) => item.user_id === userId);
}

export function getStubMastery(userId: string): Mastery[] {
  return [...stubMastery.values()].filter((item) => item.user_id === userId);
}

function firmContextFromSession(
  session: Awaited<ReturnType<typeof getPracticeSession>>,
): FirmContextSnapshot | null {
  const raw = session?.metadata?.firm_context_snapshot;
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as FirmContextSnapshot;
  if (!Array.isArray(snap.heat_topics)) return null;
  return snap;
}

/** Everything persisted in app.question_attempts.grade_json. */
export function buildGradeJson(grade: GradedPracticeAttempt): Record<string, unknown> {
  return {
    feedback: grade.feedback,
    correct: grade.correct,
    rubric_items: grade.rubric_items,
    numeric_checks: grade.numeric_checks,
    red_flags_triggered: grade.red_flags_triggered,
    follow_up: grade.follow_up,
    citations: grade.citations,
    weak_topics: grade.weak_topics,
    delivery: null,
    model: grade.model ?? null,
    cached: grade.cached ?? false,
    latency_ms: grade.latency_ms ?? null,
    diagnostics: grade.rubric_json,
  };
}

function gradeResponse(grade: GradedPracticeAttempt): AttemptGradeResponse {
  return {
    score_source: grade.score_source,
    score: grade.score,
    feedback: grade.feedback,
    weak_topics: grade.weak_topics,
    citations: grade.citations,
    rubric: grade.rubric_json,
    grader_version: grade.grader_version,
    correct: grade.correct,
    rubric_items: grade.rubric_items,
    red_flags_triggered: grade.red_flags_triggered,
    numeric_checks: grade.numeric_checks,
    follow_up: grade.follow_up,
    delivery: null,
    cached: grade.cached ?? false,
  };
}

/** Empty self-rated attempts (no text, no rating, no confidence) never count toward goals. */
function countsTowardGoal(grade: GradedPracticeAttempt, input: CreateAttemptRequest): boolean {
  if (grade.score_source === "reveal_copy") return false;
  if (grade.score_source === "self") {
    return input.correct != null || input.confidence != null || input.rating != null;
  }
  return true;
}

type RecordedAttempt = AttemptResponse & { gradeResult: GradedPracticeAttempt };

/**
 * Record an attempt, then schedule the question's next spaced review from the
 * learner's rating (or the graded score when no explicit rating was sent).
 * Reveal-copy attempts are stored for history but skip mastery + review.
 */
export async function recordPracticeAttempt(options: {
  userId: string;
  email?: string | null;
  sessionId: string;
  input: CreateAttemptRequest;
}): Promise<AttemptResponse> {
  const { gradeResult: grade, ...result } = await recordAttemptAndMastery(options);
  const questionId = result.attempt.canonical_question_id;
  const rating = ratingForAttempt({
    explicit: options.input.rating ?? null,
    scoreSource: grade.score_source,
    score: grade.score,
    confidence: options.input.confidence ?? null,
  });

  let review: AttemptResponse["review"];
  if (rating) {
    const { item } = await recordReview({
      userId: options.userId,
      email: options.email,
      questionId,
      rating,
    });
    review = { rating, due_at: item.due_at, interval_days: item.interval_days };
    if (result.mastery) {
      result.mastery = { ...result.mastery, next_review_at: item.due_at };
      if (result.source === "stub") {
        stubMastery.set(
          masteryKey(options.userId, "canonical_question", questionId),
          result.mastery,
        );
      }
    }
  }

  let activity: AttemptResponse["activity"] = null;
  try {
    activity = await recordLearningActivity({
      userId: options.userId,
      email: options.email,
      kind: "attempt",
      subjectId: questionId,
      score: grade.score_source === "self" && !options.input.response_text ? null : grade.score,
      scoreSource: grade.score_source,
      countsTowardGoal: countsTowardGoal(grade, options.input),
    });
  } catch (err) {
    console.warn("[attempts] activity update failed; attempt kept", err);
    activity = null;
  }

  return { ...result, ...(review ? { review } : {}), activity };
}

type MasteryReturnRow = { mastery: number; updated_at: string };
type ConceptReturnRow = { concept_id: string; mastery: number; updated_at: string };
type CountRow = { n: number };

async function recordAttemptAndMastery(options: {
  userId: string;
  email?: string | null;
  sessionId: string;
  input: CreateAttemptRequest;
}): Promise<RecordedAttempt> {
  const { userId, email, sessionId, input } = options;
  const session = await getPracticeSession(sessionId, userId);
  const questionId =
    input.canonical_question_id ?? input.question_id ?? session?.question_ids[0];
  if (!questionId) {
    throw new Error("Attempt requires canonical_question_id or a session question");
  }

  const grade = await gradePracticeAttempt({
    questionId,
    userId,
    responseText: input.response_text,
    correct: input.correct,
    confidence: input.confidence,
    firmContext: firmContextFromSession(session),
    revealedAt: input.revealed_at ?? null,
  });

  const now = new Date().toISOString();
  const selfScore =
    input.correct == null
      ? input.confidence ?? null
      : input.correct
        ? 1
        : 0.25;
  const gradeJson = buildGradeJson(grade);
  const updatesMastery = grade.score_source !== "reveal_copy";

  const attempt = AttemptSchema.parse({
    id: `att_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: userId,
    session_id: sessionId,
    canonical_question_id: questionId,
    answer_id: grade.answer_id,
    response_text: input.response_text,
    self_score: selfScore,
    confidence: input.confidence ?? null,
    time_spent_ms: input.time_spent_ms ?? null,
    correct: grade.score_source === "self" ? (grade.correct ?? input.correct ?? null) : grade.correct,
    weak_topics: grade.weak_topics,
    firm_id: session?.firm_ids[0] ?? null,
    score_source: grade.score_source,
    llm_score: grade.score_source === "self" ? null : grade.score,
    rubric_json: gradeJson,
    grade_citations: grade.citations,
    created_at: now,
  });

  const stubResult = (note: string): RecordedAttempt => {
    const attempts = stubAttempts.get(sessionId) ?? [];
    attempts.unshift(attempt);
    stubAttempts.set(sessionId, attempts);
    const mastery = updatesMastery
      ? upsertStubMastery({
          userId,
          questionId,
          topic: grade.topic,
          firmId: attempt.firm_id,
          score: grade.score,
          createdAt: now,
        }).question
      : stubMastery.get(masteryKey(userId, "canonical_question", questionId));
    return {
      attempt,
      ...(mastery ? { mastery } : {}),
      grade: gradeResponse(grade),
      source: "stub",
      note,
      gradeResult: grade,
    };
  };

  if (!isDatabaseConfigured()) {
    return stubResult(`DATABASE_URL unset — graded via ${grade.score_source}.`);
  }

  try {
    const sql = requireSql();
    const correctness =
      attempt.correct == null ? null : attempt.correct === true ? 1 : 0;
    const concepts = updatesMastery ? conceptIdsForTopic(grade.topic) : [];
    const results = await withRlsUserId(sql, userId, (s) => {
      const queries = [
        ensureAppUserQuery(s, userId, email),
        s`
          INSERT INTO app.question_attempts (
            id, user_id, question_id, session_id, response_text, correctness,
            score, score_source, grade_json, confidence, time_spent_ms, grader_version
          )
          VALUES (
            ${attempt.id},
            (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
            ${questionId},
            (SELECT id FROM app.study_sessions WHERE id = ${sessionId} LIMIT 1),
            ${input.response_text ?? null},
            ${correctness},
            ${grade.score},
            ${grade.score_source},
            ${JSON.stringify(gradeJson)}::jsonb,
            ${input.confidence ?? null},
            ${input.time_spent_ms ?? null},
            ${grade.grader_version}
          )
        `,
      ];
      if (updatesMastery) {
        queries.push(s`
          INSERT INTO app.mastery_records (id, user_id, question_id, mastery, updated_at)
          VALUES (
            ${`m_${randomUUID().replace(/-/g, "").slice(0, 24)}`},
            (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
            ${questionId},
            ${grade.score},
            ${now}::timestamptz
          )
          ON CONFLICT (user_id, question_id) WHERE question_id IS NOT NULL DO UPDATE SET
            mastery = LEAST(1, GREATEST(0,
              (1 - ${MASTERY_EMA_ALPHA}::float8) * app.mastery_records.mastery
              + ${MASTERY_EMA_ALPHA}::float8 * EXCLUDED.mastery)),
            updated_at = EXCLUDED.updated_at
          RETURNING mastery, updated_at
        `);
        for (const conceptId of concepts) {
          const topic = grade.topic;
          // Concept mastery = mean mastery of this user's attempted questions in
          // the concept (unseen questions carry no weight). Runs after the
          // question upsert in the same transaction, so it sees the new value.
          queries.push(s`
            INSERT INTO app.mastery_records (id, user_id, concept_id, mastery, updated_at)
            SELECT
              ${`m_${randomUUID().replace(/-/g, "").slice(0, 24)}`},
              u.id,
              ${conceptId},
              LEAST(1, GREATEST(0, avg(m.mastery))),
              ${now}::timestamptz
            FROM app.users u
            JOIN app.mastery_records m ON m.user_id = u.id AND m.question_id IS NOT NULL
            WHERE u.neon_auth_user_id = ${userId}
              AND EXISTS (SELECT 1 FROM canonical.concepts c WHERE c.id = ${conceptId})
              AND (
                m.question_id = ${questionId}
                OR m.question_id IN (
                  SELECT q.id FROM canonical.canonical_questions q WHERE q.topic = ${topic}
                )
                OR m.question_id IN (
                  SELECT qt.question_id FROM canonical.question_topics qt WHERE qt.topic_slug = ${topic}
                )
              )
            GROUP BY u.id
            ON CONFLICT (user_id, concept_id) WHERE concept_id IS NOT NULL DO UPDATE SET
              mastery = EXCLUDED.mastery,
              updated_at = EXCLUDED.updated_at
            RETURNING concept_id, mastery, updated_at
          `);
        }
        queries.push(s`
          SELECT count(*)::int AS n
          FROM app.question_attempts a
          JOIN app.users u ON u.id = a.user_id
          WHERE u.neon_auth_user_id = ${userId}
            AND a.question_id = ${questionId}
            AND a.score_source IS DISTINCT FROM 'reveal_copy'
        `);
      }
      return queries;
    });

    let mastery: Mastery | undefined;
    if (updatesMastery) {
      const questionRow = ((results[2] ?? []) as MasteryReturnRow[])[0];
      const countRow = ((results[3 + concepts.length] ?? []) as CountRow[])[0];
      if (questionRow) {
        const score = Number(questionRow.mastery);
        mastery = MasterySchema.parse({
          user_id: userId,
          subject_type: "canonical_question",
          subject_id: questionId,
          level: levelFromScore(score, true),
          score,
          attempt_count: Number(countRow?.n ?? 1),
          last_attempt_at: now,
          next_review_at: null,
          firm_id: attempt.firm_id,
          updated_at: new Date(questionRow.updated_at).toISOString(),
        });
      }
      const conceptRows = concepts
        .map((_, i) => ((results[3 + i] ?? []) as ConceptReturnRow[])[0])
        .filter((row): row is ConceptReturnRow => Boolean(row));
      if (conceptRows.length) {
        console.info(
          `[attempts] concept mastery ${conceptRows
            .map((row) => `${row.concept_id}=${Number(row.mastery).toFixed(3)}`)
            .join(", ")}`,
        );
      }
    }
    return {
      attempt,
      ...(mastery ? { mastery } : {}),
      grade: gradeResponse(grade),
      source: "published",
      note: updatesMastery
        ? `Graded via ${grade.score_source}; mastery updated from grade score.`
        : "Answer matched the revealed gold answer — saved without mastery or review credit.",
      gradeResult: grade,
    };
  } catch (err) {
    console.warn("[attempts] DB write failed; saving attempt in memory", err);
    return stubResult(`DB attempt write failed — graded via ${grade.score_source} in memory.`);
  }
}
