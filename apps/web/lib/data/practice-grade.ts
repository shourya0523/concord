/**
 * Practice attempt grading: teaching Answer = gold; Glassdoor heat = cite-only firm context.
 *
 * Wires the pure grade pipeline (lib/grading/pipeline.ts) to data + infra:
 * question/answer/rubric loading, reveal-copy detection, grade cache,
 * per-user model budget (Jev calls weigh 1/10 of a chat call), model
 * selection (Jev decisions via LLM_DECISION_MODEL, small-model escalation via
 * LLM_SMALL_MODEL), the grade router (models only when required) and logs.
 */
import { GRADER_VERSION } from "@ibpe/contracts";
import { getAnswerRubric, getQuestion } from "@/lib/data/questions";
import type { FirmContextSnapshot } from "@/lib/data/practice-packs";
import { isFlagOn } from "@/lib/flags";
import { checkRevealCopy } from "@/lib/grading/guards";
import { createGradeModels, type GradeUsage } from "@/lib/grading/llm";
import {
  gradeRubricDeterministic,
  runGradePipeline,
  type GradeInput,
} from "@/lib/grading/pipeline";
import { isNumericOnlyRubric, rubricFingerprint } from "@/lib/grading/rubric";
import { routeGrade, routeWithoutModel } from "@/lib/grading/router";
import {
  GRADER_V1,
  gradeDeterministic,
  selfGrade,
  type PracticeGradeResult,
} from "@/lib/practice-grade-core";
import {
  gradeCacheKey,
  getCachedGrade,
  logGradeEvent,
  reserveLlmGrade,
  setCachedGrade,
} from "./grade-cache";

export type { PracticeGradeResult };
export { gradeDeterministic, selfGrade };

export type GradedPracticeAttempt = PracticeGradeResult & {
  /** Question topic slug (drives concept mastery roll-up). */
  topic: string | null;
};

function revealCopyGrade(
  input: GradeInput,
  similarity: number,
): PracticeGradeResult {
  const base = input.rubric
    ? gradeRubricDeterministic(input, input.rubric)
    : gradeDeterministic({
        responseText: input.responseText,
        goldConcise: input.goldConcise,
        goldExpanded: input.goldExpanded,
        topic: input.topic,
        answerId: input.answerId,
        heatTopics: input.heatTopics,
      });
  return {
    ...base,
    score_source: "reveal_copy",
    correct: null,
    weak_topics: [],
    feedback:
      "This matches the answer you just revealed, so it doesn't count toward mastery or your streak. " +
      "Come back after a break and answer from memory — the review will be waiting.",
    rubric_json: { ...base.rubric_json, reveal_copy: { similarity } },
    follow_up: null,
  };
}

export async function gradePracticeAttempt(options: {
  questionId: string;
  userId?: string | null;
  responseText?: string | null;
  correct?: boolean | null;
  confidence?: number | null;
  firmContext?: FirmContextSnapshot | null;
  /** ISO time the learner revealed the gold answer (anti-gaming, P3.4). */
  revealedAt?: string | null;
  now?: Date;
}): Promise<GradedPracticeAttempt> {
  const started = Date.now();
  const responseText = options.responseText?.trim() ?? "";
  const detail = await getQuestion(options.questionId, { includeStudy: true });
  const topic = detail?.question.topic ?? null;

  if (!responseText) {
    return {
      ...selfGrade({ correct: options.correct, confidence: options.confidence, topic }),
      router: routeWithoutModel(routeGrade({ responseText, rubric: null, llmAvailable: false })),
      topic,
    };
  }

  const study = detail?.study;
  const goldConcise = study?.direct_answer?.trim() ?? "";
  const goldExpanded = study?.interview_ready_explanation?.trim() ?? "";
  const heatTopics = options.firmContext?.heat_topics ?? [];

  if (!goldConcise && !goldExpanded) {
    const self = selfGrade({
      correct: options.correct,
      confidence: options.confidence,
      topic,
    });
    return {
      ...self,
      feedback: "No teaching answer available — kept self/confidence score.",
      topic,
    };
  }

  const graderV2 = isFlagOn("grader_v2");
  const rubricRecord = graderV2 ? await getAnswerRubric(study?.answer_id) : null;
  const rubric = rubricRecord?.rubric ?? null;
  const input: GradeInput = {
    questionId: options.questionId,
    questionWording: detail?.question.canonical_wording ?? options.questionId,
    responseText,
    topic,
    answerId: study?.answer_id ?? `answer:${options.questionId}`,
    goldConcise,
    goldExpanded,
    commonMistakes: study?.common_mistakes ?? [],
    formulae: study?.formulae ?? [],
    rubric,
    heatTopics,
  };

  const reveal = checkRevealCopy({
    revealedAt: options.revealedAt,
    now: options.now,
    answer: responseText,
    goldConcise,
    goldExpanded,
  });
  if (reveal.copied) {
    const graded = {
      ...revealCopyGrade(input, reveal.similarity),
      router: routeWithoutModel(
        routeGrade({ responseText, rubric, revealCopy: true, llmAvailable: false }),
      ),
    };
    logGradeEvent({
      question_id: options.questionId,
      score_source: graded.score_source,
      grader_version: graded.grader_version,
      cached: false,
      latency_ms: Date.now() - started,
      router: graded.router.reason,
      path: graded.router.path,
    });
    return { ...graded, latency_ms: Date.now() - started, topic };
  }

  const numericOnly = Boolean(rubric && isNumericOnlyRubric(rubric));
  const usages: GradeUsage[] = [];
  const models = numericOnly
    ? null
    : createGradeModels({ onUsage: (u) => usages.push(u) });

  const cacheKey = models
    ? gradeCacheKey({
        questionId: options.questionId,
        rubricFingerprint: rubricFingerprint(rubric),
        graderVersion: rubric ? GRADER_VERSION : GRADER_V1,
        model: `${models.decisionModel}+${models.chatModel}@${models.confidenceFloor}`,
        responseText,
      })
    : null;
  if (cacheKey) {
    const cached = await getCachedGrade(cacheKey);
    if (cached) {
      const latency = Date.now() - started;
      const router = routeWithoutModel(
        routeGrade({ responseText, rubric, cacheHit: true, llmAvailable: true }),
      );
      logGradeEvent({
        question_id: options.questionId,
        score_source: cached.score_source,
        grader_version: cached.grader_version,
        cached: true,
        latency_ms: latency,
        model: cached.model ?? null,
        router: router.reason,
        path: router.path,
      });
      return { ...cached, router, cached: true, latency_ms: latency, topic };
    }
  }

  // Budget is reserved per model call, only when the router needs one
  // (Jev = 1 unit, small-model escalation = 10 units).
  let rateLimited = false;
  let llmError: string | null = null;
  const graded = await runGradePipeline(input, {
    graderV2,
    decide: models?.decide ?? null,
    decisionModel: models?.decisionModel ?? null,
    llm: models?.caller ?? null,
    model: models?.chatModel ?? null,
    confidenceFloor: models?.confidenceFloor,
    allowLlm: async (kind) => {
      const ok = options.userId ? await reserveLlmGrade(options.userId, kind) : true;
      if (!ok) rateLimited = true;
      return ok;
    },
    onLlmError: (err) => {
      llmError = err instanceof Error ? `${err.name}${"code" in err ? `:${String(err.code)}` : ""}` : "error";
      console.warn("[practice-grade] model grade failed; falling back", err);
    },
  });

  if (cacheKey && (graded.score_source === "llm" || graded.score_source === "jev")) {
    await setCachedGrade(cacheKey, graded).catch(() => undefined);
  }
  const sum = (pick: (u: GradeUsage) => number | null | undefined) =>
    usages.length ? usages.reduce((total, u) => total + (pick(u) ?? 0), 0) : null;
  logGradeEvent({
    question_id: options.questionId,
    score_source: graded.score_source,
    grader_version: graded.grader_version,
    cached: false,
    latency_ms: Date.now() - started,
    model: graded.model ?? null,
    input_tokens: sum((u) => u.input_tokens),
    output_tokens: sum((u) => u.output_tokens),
    cost: graded.router?.cost_usd ?? sum((u) => u.cost),
    rate_limited: rateLimited,
    llm_error: llmError,
    router: graded.router?.reason ?? null,
    path: graded.router?.path ?? null,
    escalation: graded.router?.escalation ?? null,
    decision_model: graded.router?.decision_model ?? null,
    chat_model: graded.router?.chat_model ?? null,
  });
  return {
    ...graded,
    cached: false,
    latency_ms: Date.now() - started,
    rubric_json: {
      ...graded.rubric_json,
      ...(rateLimited ? { rate_limited: true } : {}),
      ...(usages.length ? { usage: usages } : {}),
    },
    topic,
  };
}
