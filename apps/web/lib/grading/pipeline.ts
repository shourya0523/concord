/**
 * Grade pipeline (plan P3.1 / P3.2 / P0.5; decision log "Grader = Jev
 * decisions + small-LLM escalation"): pure orchestration over injected model
 * callers, shared by the attempt API and the eval harness.
 *
 *   numeric-only rubric                      → numeric (no model)
 *   router skip (empty, reveal-copy, cache,  → deterministic / skip (no model)
 *     injection regex, stuffing, decisive)
 *   otherwise ONE Jev request               → score_source "jev"
 *     rubric:    choice hit|partial|miss per key point, noul per red flag,
 *                noul instructs_grader → verdicts scored by rubric.ts
 *     no rubric: score over 4 levels → position / 3
 *   escalate to the SMALL chat model only when a must-have's Jev confidence
 *     (or the no-rubric score confidence) < JEV_CONFIDENCE_FLOOR, or Jev
 *     errors → rubric judge / holistic prompt, score_source "llm"
 *   chat fails too → the Jev grade when there is one, else deterministic
 *   no key / rate-limited → deterministic (exactly the pre-Jev behaviour)
 *
 * Every result carries `router` (GradeRoute): path skip | jev | jev+small |
 * small | deterministic, the reason, the models called and total cost.
 */
import {
  GRADER_VERSION,
  type AnswerRubric,
  type AttemptGradeCitation,
  type NumericCheckResult,
  type RubricItemResult,
} from "@ibpe/contracts"
import {
  buildCitations,
  firmHeatNote,
  GRADER_V1,
  gradeDeterministic,
  WEAK_GRADE_THRESHOLD,
  type HeatTopicCue,
  type PracticeGradeResult,
} from "../practice-grade-core"
import {
  assessStuffing,
  capForInjection,
  detectInjection,
  INJECTION_RED_FLAG,
  KEYWORD_LIST_CAP,
} from "./guards"
import {
  buildJevRubricQuestions,
  buildJevScoreQuestions,
  DEFAULT_CONFIDENCE_FLOOR,
  escalationFor,
  jevGradeState,
  jevRubricFeedback,
  jevScoreFeedback,
  mapJevRubricAnswers,
  mapJevScoreAnswers,
  type GradeDecider,
} from "./jev"
import {
  allowedCitationIds,
  buildHolisticJudgePrompt,
  buildRubricJudgePrompt,
  callWithTimeout,
  DEFAULT_GRADER_TIMEOUT_MS,
  HOLISTIC_JUDGE_SYSTEM,
  HolisticJudgeSchema,
  RUBRIC_JUDGE_SYSTEM,
  RubricJudgeSchema,
  runWithTimeout,
  type JudgeContext,
  type ModelUsage,
  type StructuredCaller,
} from "./judge"
import { runNumericChecks } from "./numbers"
import {
  routeGrade,
  routeWithoutModel,
  type EscalationReason,
  type GradeRoute,
  type GradeRoutePath,
  type RouterDecision,
} from "./router"
import {
  applyVerdicts,
  chooseFollowUp,
  isNumericOnlyRubric,
  judgeKeyPointDeterministic,
  PASS_THRESHOLD,
  RED_FLAG_PENALTY,
  redFlagId,
  scoreNumericOnly,
  scoreRubric,
  verifyEvidence,
} from "./rubric"

export type GradeInput = {
  questionId: string
  questionWording: string
  responseText: string
  topic?: string | null
  answerId: string | null
  goldConcise: string
  goldExpanded: string
  commonMistakes?: string[]
  formulae?: string[]
  rubric?: AnswerRubric | null
  heatTopics?: HeatTopicCue[]
}

export type ModelCallKind = "decision" | "chat"

/** Jev decisions get a tighter budget than chat: typed answers, no generation. */
export const DEFAULT_DECISION_TIMEOUT_MS = 5000

export type GradeOptions = {
  /** isFlagOn("grader_v2"); when false a rubric is ignored (v1 behaviour). */
  graderV2: boolean
  /** Jev decision call; null/undefined → no decision tier. */
  decide?: GradeDecider | null
  /** Decision model id (recorded on the route / result). */
  decisionModel?: string | null
  /** Small chat model caller (escalation, or chat-only when `decide` is absent). */
  llm?: StructuredCaller | null
  /** Small chat model id. */
  model?: string | null
  /** Escalate when a must-have's Jev confidence is below this (default 0.6). */
  confidenceFloor?: number
  /** Chat call timeout. */
  timeoutMs?: number
  /** Jev call timeout. */
  decisionTimeoutMs?: number
  /** Called when a model call fails or times out (logging hook). */
  onLlmError?: (err: unknown) => void
  /**
   * Grade router (default on): skip models when the deterministic pre-grade
   * is decisive. `false` sends every non-numeric grade to the models (tests,
   * full-model eval runs).
   */
  router?: boolean
  /**
   * Called before each model call (per-user rate-limit reservation; Jev calls
   * are cheaper than chat calls). Resolving false skips that call.
   */
  allowLlm?: (kind: ModelCallKind) => Promise<boolean>
}

function weakTopicsFor(score: number, topic: string | null | undefined, extra: string[] = []): string[] {
  const out = new Set(extra.filter(Boolean))
  if (score < WEAK_GRADE_THRESHOLD && topic) out.add(topic)
  return [...out]
}

function citationsFromIds(
  ids: string[],
  ctx: Pick<JudgeContext, "answerId" | "heatTopics">,
): AttemptGradeCitation[] {
  const allowed = allowedCitationIds(ctx)
  const citations: AttemptGradeCitation[] = ids
    .filter((id) => allowed.has(id))
    .map((id) => {
      if (id === ctx.answerId) {
        return { id, kind: "teaching_answer" as const, label: "Teaching answer" }
      }
      const heat = ctx.heatTopics.find((h) => `heat:${h.firm_id}:${h.topic_id}` === id)
      return { id, kind: "heat_topic" as const, label: heat?.topic_id ?? id }
    })
  if (!citations.some((c) => c.kind === "teaching_answer")) {
    citations.unshift({ id: ctx.answerId, kind: "teaching_answer", label: "Teaching answer" })
  }
  return citations
}

function describeRubricResult(options: {
  score: number
  items: RubricItemResult[]
  numeric: NumericCheckResult[]
  redFlags: string[]
}): string {
  const hits = options.items.filter((i) => i.verdict === "hit").length
  const missedMust = options.items.filter((i) => i.must_have && i.verdict !== "hit")
  const parts = [
    `Score ${Math.round(options.score * 100)}% — ${hits}/${options.items.length} key points hit.`,
  ]
  if (missedMust.length) {
    parts.push(`Must-have missing: ${missedMust.map((i) => i.text).join("; ")}.`)
  }
  const failed = options.numeric.filter((n) => !n.pass)
  if (options.numeric.length) {
    parts.push(
      failed.length
        ? `Numbers to fix: ${failed.map((n) => `${n.label} (expected ${n.expected}${n.unit ?? ""})`).join("; ")}.`
        : "All numbers check out.",
    )
  }
  if (options.redFlags.length) parts.push(`Red flags: ${options.redFlags.join("; ")}.`)
  return parts.join(" ")
}

/** Numeric-only rubric: exact checks, no LLM (score_source "numeric"). */
export function gradeNumericRubric(input: GradeInput, rubric: AnswerRubric): PracticeGradeResult {
  const numeric = runNumericChecks(rubric.numeric_checks, input.responseText)
  const injection = detectInjection(input.responseText)
  const scored = scoreNumericOnly(numeric)
  const score = injection
    ? Number(capForInjection(Math.max(0, scored.score - RED_FLAG_PENALTY), true).toFixed(3))
    : scored.score
  const redFlags = injection ? [INJECTION_RED_FLAG] : []
  const citations = buildCitations(input.answerId, input.heatTopics)
  return {
    score,
    correct: score >= PASS_THRESHOLD && !injection,
    score_source: "numeric",
    feedback: describeRubricResult({ score, items: [], numeric, redFlags }),
    weak_topics: weakTopicsFor(score, input.topic),
    citations,
    rubric_json: { mode: "numeric_only", rubric_version: rubric.version },
    answer_id: input.answerId,
    grader_version: GRADER_VERSION,
    rubric_items: [],
    numeric_checks: numeric,
    red_flags_triggered: redFlags,
    follow_up: score < 1 ? (rubric.follow_ups[0] ?? null) : null,
  }
}

/** Heuristic rubric grade: per key point cues/tokens + stuffing caps. */
export function gradeRubricDeterministic(input: GradeInput, rubric: AnswerRubric): PracticeGradeResult {
  const answer = input.responseText
  const judged = rubric.key_points.map((kp) => judgeKeyPointDeterministic(kp, answer))
  const { items } = applyVerdicts(rubric.key_points, judged, answer, { requireEvidence: false })
  const numeric = runNumericChecks(rubric.numeric_checks, answer)
  const injection = detectInjection(answer)
  const redFlags = injection ? [INJECTION_RED_FLAG] : []
  const scored = scoreRubric({ items, numeric, redFlagCount: redFlags.length })
  const goldText =
    input.goldConcise || rubric.key_points.map((kp) => kp.text).join(". ")
  const stuffing = assessStuffing(answer, goldText)
  const score = Number(capForInjection(Math.min(scored.score, stuffing.cap), injection).toFixed(3))
  const correct = score >= PASS_THRESHOLD && scored.must_haves_hit && !injection
  const citations = buildCitations(input.answerId, input.heatTopics)
  return {
    score,
    correct,
    score_source: "deterministic",
    feedback:
      describeRubricResult({ score, items, numeric, redFlags }) +
      " (Estimated without the AI grader.)" +
      firmHeatNote(citations, score),
    weak_topics: weakTopicsFor(score, input.topic),
    citations,
    rubric_json: {
      mode: "rubric_heuristic",
      rubric_version: rubric.version,
      raw: scored.raw,
      stuffing_cap: stuffing.cap,
      stuffing_reasons: stuffing.reasons,
      coverage: Object.fromEntries(judged.map((j) => [j.id, Number(j.coverage.toFixed(3))])),
    },
    answer_id: input.answerId,
    grader_version: GRADER_VERSION,
    rubric_items: items,
    numeric_checks: numeric,
    red_flags_triggered: redFlags,
    follow_up: chooseFollowUp(rubric, items, null),
  }
}

/**
 * LLM paths keep only the objective shape guards (keyword list, repetition,
 * dump) — not the length-ratio cap, since the model can judge terse answers.
 */
function shapeCap(answer: string, gold: string): { cap: number; reasons: string[] } {
  const stuffing = assessStuffing(answer, gold)
  const reasons = stuffing.reasons.filter((r) => r !== "short_vs_gold")
  if (reasons.length === 0) return { cap: 1, reasons }
  const cap = reasons.includes("keyword_list")
    ? KEYWORD_LIST_CAP
    : reasons.includes("repetition")
      ? 0.4
      : stuffing.cap
  return { cap, reasons }
}

function judgeContext(input: GradeInput): JudgeContext {
  return {
    questionWording: input.questionWording,
    responseText: input.responseText,
    answerId: input.answerId ?? `answer:${input.questionId}`,
    goldConcise: input.goldConcise,
    goldExpanded: input.goldExpanded,
    commonMistakes: input.commonMistakes ?? [],
    heatTopics: input.heatTopics ?? [],
  }
}

/** v2 rubric judge: model ticks boxes, code verifies quotes and scores. */
export async function gradeRubricWithLlm(
  input: GradeInput,
  rubric: AnswerRubric,
  llm: StructuredCaller,
  options: Pick<GradeOptions, "timeoutMs" | "model"> & { onUsage?: (usage: ModelUsage) => void } = {},
): Promise<PracticeGradeResult> {
  const ctx = judgeContext(input)
  const output = await callWithTimeout(
    llm,
    {
      schema: RubricJudgeSchema,
      system: RUBRIC_JUDGE_SYSTEM,
      prompt: buildRubricJudgePrompt(ctx, rubric),
      onUsage: options.onUsage,
    },
    options.timeoutMs ?? DEFAULT_GRADER_TIMEOUT_MS,
  )
  const parsed = RubricJudgeSchema.parse(output)
  const answer = input.responseText
  const { items, downgraded } = applyVerdicts(rubric.key_points, parsed.items, answer)
  const numeric = runNumericChecks(rubric.numeric_checks, answer)

  const redFlagIds = new Map(rubric.red_flags.map((r, i) => [redFlagId(i), r]))
  const redFlags: string[] = []
  for (const flag of parsed.red_flags_triggered) {
    const text = redFlagIds.get(flag.id)
    if (text && verifyEvidence(answer, flag.evidence) && !redFlags.includes(text)) {
      redFlags.push(text)
    }
  }
  const injection = detectInjection(answer)
  if (injection) redFlags.push(INJECTION_RED_FLAG)

  const scored = scoreRubric({ items, numeric, redFlagCount: redFlags.length })
  const shape = shapeCap(answer, input.goldConcise)
  const score = Number(
    capForInjection(Math.min(scored.score, shape.cap), injection).toFixed(3),
  )
  const citations = citationsFromIds(parsed.citation_ids, ctx)
  const feedback = parsed.feedback.trim()
  return {
    score,
    correct: score >= PASS_THRESHOLD && scored.must_haves_hit && !injection,
    score_source: "llm",
    feedback: feedback
      ? `${feedback} ${describeRubricResult({ score, items, numeric, redFlags: [] })}`.trim()
      : describeRubricResult({ score, items, numeric, redFlags }),
    weak_topics: weakTopicsFor(score, input.topic, parsed.weak_topics.slice(0, 4)),
    citations,
    rubric_json: {
      mode: "rubric_llm",
      rubric_version: rubric.version,
      raw: scored.raw,
      evidence_downgraded: downgraded,
      shape_reasons: shape.reasons,
      model: options.model ?? null,
    },
    answer_id: ctx.answerId,
    grader_version: GRADER_VERSION,
    rubric_items: items,
    numeric_checks: numeric,
    red_flags_triggered: redFlags,
    follow_up: chooseFollowUp(rubric, items, parsed.follow_up_id),
    model: options.model ?? null,
  }
}

/** v1 holistic LLM grade; `correct` is derived from score so they never disagree. */
export async function gradeHolisticWithLlm(
  input: GradeInput,
  llm: StructuredCaller,
  options: Pick<GradeOptions, "timeoutMs" | "model"> & { onUsage?: (usage: ModelUsage) => void } = {},
): Promise<PracticeGradeResult> {
  const ctx = judgeContext(input)
  const output = await callWithTimeout(
    llm,
    {
      schema: HolisticJudgeSchema,
      system: HOLISTIC_JUDGE_SYSTEM,
      prompt: buildHolisticJudgePrompt(ctx),
      onUsage: options.onUsage,
    },
    options.timeoutMs ?? DEFAULT_GRADER_TIMEOUT_MS,
  )
  const parsed = HolisticJudgeSchema.parse(output)
  const injection = detectInjection(input.responseText)
  let score = parsed.score
  if (injection) score = capForInjection(Math.max(0, score - RED_FLAG_PENALTY), true)
  score = Math.min(score, shapeCap(input.responseText, input.goldConcise).cap)
  score = Number(Math.min(1, Math.max(0, score)).toFixed(3))
  return {
    score,
    correct: score >= PASS_THRESHOLD && !injection,
    score_source: "llm",
    feedback: parsed.feedback,
    weak_topics: weakTopicsFor(score, input.topic, parsed.weak_topics.slice(0, 4)),
    citations: citationsFromIds(parsed.citation_ids, ctx),
    rubric_json: {
      mode: "holistic_llm",
      key_points_hit: parsed.key_points_hit,
      firm_alignment_note: parsed.firm_alignment_note ?? null,
      citation_ids: parsed.citation_ids,
      model: options.model ?? null,
    },
    answer_id: ctx.answerId,
    grader_version: GRADER_V1,
    rubric_items: [],
    numeric_checks: [],
    red_flags_triggered: injection ? [INJECTION_RED_FLAG] : [],
    follow_up: null,
    model: options.model ?? null,
  }
}

function deterministicNoRubric(input: GradeInput): PracticeGradeResult {
  return gradeDeterministic({
    responseText: input.responseText,
    goldConcise: input.goldConcise,
    goldExpanded: input.goldExpanded,
    commonMistakes: input.commonMistakes,
    formulae: input.formulae,
    topic: input.topic,
    answerId: input.answerId,
    heatTopics: input.heatTopics,
  })
}

/* ------------------------------------------------------------------ */
/* Jev (decision model)                                                */
/* ------------------------------------------------------------------ */

export type JevGradeOutcome = {
  grade: PracticeGradeResult
  /** Non-null when the small chat model should re-grade (low confidence). */
  escalation: { reason: EscalationReason; ids: string[] } | null
  /** Snapshot that answered. */
  model: string | null
  cost: number | null
}

type JevOptions = Pick<GradeOptions, "decisionModel" | "confidenceFloor" | "decisionTimeoutMs">

function callDecider(
  decide: GradeDecider,
  request: Omit<Parameters<GradeDecider>[0], "signal">,
  timeoutMs: number,
): ReturnType<GradeDecider> {
  return runWithTimeout((signal) => decide({ ...request, signal }), timeoutMs)
}

/**
 * Rubric grade from ONE Jev request: a choice per key point, a noul per red
 * flag and `instructs_grader`. Code scores the verdicts exactly as for the
 * chat judge (rubric.ts); feedback and follow-up are templated. Throws on a
 * failed / malformed Jev call (the pipeline escalates).
 */
export async function gradeRubricWithJev(
  input: GradeInput,
  rubric: AnswerRubric,
  decide: GradeDecider,
  options: JevOptions = {},
): Promise<JevGradeOutcome> {
  const out = await callDecider(
    decide,
    { state: jevGradeState(input), questions: buildJevRubricQuestions(rubric) },
    options.decisionTimeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS,
  )
  const mapping = mapJevRubricAnswers(rubric, out.answers)
  const answer = input.responseText
  const numeric = runNumericChecks(rubric.numeric_checks, answer)
  const injection = detectInjection(answer) || mapping.instructsGrader
  const redFlags = [...mapping.redFlags]
  if (injection) redFlags.push(INJECTION_RED_FLAG)
  const scored = scoreRubric({ items: mapping.items, numeric, redFlagCount: redFlags.length })
  const shape = shapeCap(answer, input.goldConcise)
  const score = Number(capForInjection(Math.min(scored.score, shape.cap), injection).toFixed(3))
  const model = out.model ?? options.decisionModel ?? null
  const floor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR
  const escalation = escalationFor({ items: mapping.items, floor })
  return {
    grade: {
      score,
      correct: score >= PASS_THRESHOLD && scored.must_haves_hit && !injection,
      score_source: "jev",
      feedback: jevRubricFeedback({ items: mapping.items, numeric, redFlags, injection }),
      weak_topics: weakTopicsFor(score, input.topic),
      citations: buildCitations(input.answerId, input.heatTopics),
      rubric_json: {
        mode: "rubric_jev",
        rubric_version: rubric.version,
        raw: scored.raw,
        shape_reasons: shape.reasons,
        confidence_floor: floor,
        low_confidence: escalation?.ids ?? [],
        red_flag_probabilities: mapping.redFlagProbabilities,
        instructs_grader: mapping.instructsProbability,
        model,
      },
      answer_id: input.answerId,
      grader_version: GRADER_VERSION,
      rubric_items: mapping.items,
      numeric_checks: numeric,
      red_flags_triggered: redFlags,
      follow_up: chooseFollowUp(rubric, mapping.items, null),
      model,
    },
    escalation,
    model,
    cost: out.usage?.cost ?? null,
  }
}

/** No-rubric grade from ONE Jev request: a 4-level score (position / 3) + instructs_grader. */
export async function gradeScoreWithJev(
  input: GradeInput,
  decide: GradeDecider,
  options: JevOptions = {},
): Promise<JevGradeOutcome> {
  const out = await callDecider(
    decide,
    { state: jevGradeState(input), questions: buildJevScoreQuestions() },
    options.decisionTimeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS,
  )
  const mapping = mapJevScoreAnswers(out.answers)
  const injection = detectInjection(input.responseText) || mapping.instructsGrader
  let score = mapping.score
  if (injection) score = capForInjection(Math.max(0, score - RED_FLAG_PENALTY), true)
  score = Math.min(score, shapeCap(input.responseText, input.goldConcise).cap)
  score = Number(Math.min(1, Math.max(0, score)).toFixed(3))
  const model = out.model ?? options.decisionModel ?? null
  const floor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR
  return {
    grade: {
      score,
      correct: score >= PASS_THRESHOLD && !injection,
      score_source: "jev",
      feedback: jevScoreFeedback({ label: mapping.label, score, goldConcise: input.goldConcise, injection }),
      weak_topics: weakTopicsFor(score, input.topic),
      citations: buildCitations(input.answerId, input.heatTopics),
      rubric_json: {
        mode: "score_jev",
        level: mapping.label,
        jev_score: mapping.score,
        confidence: mapping.confidence,
        confidence_floor: floor,
        instructs_grader: mapping.instructsProbability,
        model,
      },
      answer_id: input.answerId,
      grader_version: GRADER_V1,
      rubric_items: [],
      numeric_checks: [],
      red_flags_triggered: injection ? [INJECTION_RED_FLAG] : [],
      follow_up: null,
      model,
    },
    escalation: escalationFor({ scoreConfidence: mapping.confidence, floor }),
    model,
    cost: out.usage?.cost ?? null,
  }
}

/** Full grade for a typed answer with gold available. Never throws on model failure. */
export async function runGradePipeline(
  input: GradeInput,
  options: GradeOptions,
): Promise<PracticeGradeResult> {
  const rubric = options.graderV2 ? (input.rubric ?? null) : null
  const started = Date.now()
  const finish = (result: PracticeGradeResult, router: GradeRoute): PracticeGradeResult => ({
    ...result,
    router,
    latency_ms: Date.now() - started,
  })

  if (rubric && isNumericOnlyRubric(rubric)) {
    return finish(gradeNumericRubric(input, rubric), routeWithoutModel({ reason: "numeric_only" }))
  }

  const deterministic = rubric ? gradeRubricDeterministic(input, rubric) : deterministicNoRubric(input)
  const modelAvailable = Boolean(options.decide || options.llm)
  const decision: RouterDecision =
    options.router === false && modelAvailable
      ? { llm: true, reason: rubric ? "ambiguous" : "no_rubric", model: options.decisionModel ?? null }
      : routeGrade({
          responseText: input.responseText,
          rubric,
          goldConcise: input.goldConcise,
          goldExpanded: input.goldExpanded,
          questionWording: input.questionWording,
          deterministic,
          injection: detectInjection(input.responseText),
          llmAvailable: modelAvailable,
          model: options.decisionModel ?? options.model ?? null,
        })
  if (!decision.llm) return finish(deterministic, routeWithoutModel(decision))

  let cost: number | null = null
  const addCost = (value: number | null | undefined) => {
    if (value != null && Number.isFinite(value)) cost = (cost ?? 0) + value
  }
  let decisionModel: string | null = null
  let chatModel: string | null = null
  const route = (path: GradeRoutePath, extra: Partial<GradeRoute> = {}): GradeRoute => ({
    path,
    reason: decision.reason,
    escalation: null,
    decision_model: decisionModel,
    chat_model: chatModel,
    cost_usd: cost == null ? null : Number(cost.toFixed(8)),
    ...extra,
  })
  const allow = async (kind: ModelCallKind) => (options.allowLlm ? options.allowLlm(kind) : true)

  // 1. Jev: one typed decision request.
  let jev: JevGradeOutcome | null = null
  let escalation: EscalationReason | null = null
  let escalationIds: string[] = []
  if (options.decide) {
    if (!(await allow("decision"))) {
      return finish(deterministic, route("deterministic", { reason: "rate_limited" }))
    }
    decisionModel = options.decisionModel ?? null
    try {
      jev = rubric
        ? await gradeRubricWithJev(input, rubric, options.decide, options)
        : await gradeScoreWithJev(input, options.decide, options)
      decisionModel = jev.model
      addCost(jev.cost)
      if (!jev.escalation) return finish(jev.grade, route("jev"))
      escalation = jev.escalation.reason
      escalationIds = jev.escalation.ids
    } catch (err) {
      options.onLlmError?.(err)
      escalation = "jev_error"
    }
  }

  // 2. Small chat model: only on escalation (or when no decision tier exists).
  if (options.llm && (escalation || !options.decide)) {
    if (await allow("chat")) {
      chatModel = options.model ?? null
      try {
        const onUsage = (usage: ModelUsage) => addCost(usage.cost)
        const graded = rubric
          ? await gradeRubricWithLlm(input, rubric, options.llm, { ...options, onUsage })
          : await gradeHolisticWithLlm(input, options.llm, { ...options, onUsage })
        const result: PracticeGradeResult =
          escalation === "low_confidence"
            ? {
                ...graded,
                rubric_json: { ...graded.rubric_json, escalated_from_jev: { low_confidence: escalationIds } },
              }
            : graded
        return finish(result, route(options.decide ? "jev+small" : "small", { escalation }))
      } catch (err) {
        options.onLlmError?.(err)
      }
    } else if (!options.decide) {
      return finish(deterministic, route("deterministic", { reason: "rate_limited" }))
    }
  }

  // 3. Chat unavailable / failed: keep a low-confidence Jev grade, else deterministic.
  if (jev) return finish(jev.grade, route("jev", { escalation }))
  return finish(deterministic, route("deterministic", { escalation }))
}
