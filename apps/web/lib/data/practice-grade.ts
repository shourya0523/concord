/**
 * Practice attempt grading: teaching Answer = gold; Glassdoor heat = cite-only firm context.
 *
 * Wires the pure grade pipeline (lib/grading/pipeline.ts) to data + infra:
 * question/answer/rubric loading, reveal-copy detection, grade cache,
 * per-user LLM rate limit, model selection (LLM_PRIMARY_MODEL via OpenRouter),
 * the grade router (LLM only when required) and latency logs.
 */
import { GRADER_VERSION } from "@ibpe/contracts";
import { getAnswerRubric, getQuestion } from "@/lib/data/questions";
import type { FirmContextSnapshot } from "@/lib/data/practice-packs";
import { isFlagOn } from "@/lib/flags";
import { checkRevealCopy } from "@/lib/grading/guards";
import { createGradeCaller, type GradeUsage } from "@/lib/grading/llm";
import {
  gradeRubricDeterministic,
  runGradePipeline,
  type GradeInput,
} from "@/lib/grading/pipeline";
import { isNumericOnlyRubric, rubricFingerprint } from "@/lib/grading/rubric";
import { routeGrade } from "@/lib/grading/router";
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
      router: routeGrade({ responseText, rubric: null, llmAvailable: false }),
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
      router: routeGrade({ responseText, rubric, revealCopy: true, llmAvailable: false }),
    };
    logGradeEvent({
      question_id: options.questionId,
      score_source: graded.score_source,
      grader_version: graded.grader_version,
      cached: false,
      latency_ms: Date.now() - started,
      router: graded.router.reason,
    });
    return { ...graded, latency_ms: Date.now() - started, topic };
  }

  const numericOnly = Boolean(rubric && isNumericOnlyRubric(rubric));
  let usage: GradeUsage | null = null;
  const model = numericOnly
    ? null
    : createGradeCaller({ onUsage: (u) => (usage = u) });

  const cacheKey = model
    ? gradeCacheKey({
        questionId: options.questionId,
        rubricFingerprint: rubricFingerprint(rubric),
        graderVersion: rubric ? GRADER_VERSION : GRADER_V1,
        model: model.model,
        responseText,
      })
    : null;
  if (cacheKey) {
    const cached = await getCachedGrade(cacheKey);
    if (cached) {
      const latency = Date.now() - started;
      const router = routeGrade({ responseText, rubric, cacheHit: true, llmAvailable: true });
      logGradeEvent({
        question_id: options.questionId,
        score_source: cached.score_source,
        grader_version: cached.grader_version,
        cached: true,
        latency_ms: latency,
        model: cached.model ?? null,
        router: router.reason,
      });
      return { ...cached, router, cached: true, latency_ms: latency, topic };
    }
  }

  // Rate-limit budget is reserved only when the router actually needs the LLM.
  let rateLimited = false;
  let llmError: string | null = null;
  const graded = await runGradePipeline(input, {
    graderV2,
    llm: model?.caller ?? null,
    model: model?.model ?? null,
    allowLlm: async () => {
      const ok = options.userId ? await reserveLlmGrade(options.userId) : true;
      rateLimited = !ok;
      return ok;
    },
    onLlmError: (err) => {
      llmError = err instanceof Error ? err.name : "error";
      console.warn("[practice-grade] LLM grade failed; using deterministic", err);
    },
  });

  if (cacheKey && graded.score_source === "llm") {
    await setCachedGrade(cacheKey, graded).catch(() => undefined);
  }
  const finalUsage = usage as GradeUsage | null;
  logGradeEvent({
    question_id: options.questionId,
    score_source: graded.score_source,
    grader_version: graded.grader_version,
    cached: false,
    latency_ms: Date.now() - started,
    model: graded.model ?? null,
    input_tokens: finalUsage?.input_tokens ?? null,
    output_tokens: finalUsage?.output_tokens ?? null,
    cost: finalUsage?.cost ?? null,
    rate_limited: rateLimited,
    llm_error: llmError,
    router: graded.router?.reason ?? null,
  });
  return {
    ...graded,
    cached: false,
    latency_ms: Date.now() - started,
    rubric_json: {
      ...graded.rubric_json,
      ...(rateLimited ? { rate_limited: true } : {}),
      ...(finalUsage ? { usage: finalUsage } : {}),
    },
    topic,
  };
}
