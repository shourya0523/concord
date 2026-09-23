/**
 * Grade pipeline (plan P3.1 / P3.2 / P0.5): pure orchestration over an
 * injected model caller, shared by the attempt API and the eval harness.
 *
 *   rubric + grader_v2 ─┬─ numeric-only rubric  → numeric (no LLM)
 *                       ├─ router: decisive / injection → heuristic rubric (no LLM)
 *                       ├─ LLM available        → rubric judge → code score
 *                       └─ LLM missing / fails  → heuristic rubric (cues)
 *   no rubric / v2 off ─┬─ injection            → heuristic overlap (no LLM)
 *                       ├─ LLM available        → v1 holistic (correct = score ≥ 0.7)
 *                       └─ LLM missing / fails  → heuristic overlap
 *
 * Every result carries `router` (lib/grading/router.ts): whether an LLM call
 * was needed, why, and the model it went to.
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
  allowedCitationIds,
  buildHolisticJudgePrompt,
  buildRubricJudgePrompt,
  callWithTimeout,
  DEFAULT_GRADER_TIMEOUT_MS,
  HOLISTIC_JUDGE_SYSTEM,
  HolisticJudgeSchema,
  RUBRIC_JUDGE_SYSTEM,
  RubricJudgeSchema,
  type JudgeContext,
  type StructuredCaller,
} from "./judge"
import { runNumericChecks } from "./numbers"
import { routeGrade, type RouterDecision } from "./router"
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

export type GradeOptions = {
  /** isFlagOn("grader_v2"); when false a rubric is ignored (v1 behaviour). */
  graderV2: boolean
  /** Model caller; null/undefined → deterministic paths only. */
  llm?: StructuredCaller | null
  model?: string | null
  timeoutMs?: number
  /** Called when an LLM call fails or times out (logging hook). */
  onLlmError?: (err: unknown) => void
  /**
   * Grade router (default on): skip the LLM when the deterministic pre-grade
   * is decisive. `false` sends every non-numeric grade to the LLM (tests,
   * full-LLM eval runs).
   */
  router?: boolean
  /**
   * Called only when the router decides an LLM call is needed (e.g. per-user
   * rate-limit reservation). Resolving false → deterministic, reason "rate_limited".
   */
  allowLlm?: () => Promise<boolean>
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
  options: Pick<GradeOptions, "timeoutMs" | "model"> = {},
): Promise<PracticeGradeResult> {
  const ctx = judgeContext(input)
  const output = await callWithTimeout(
    llm,
    {
      schema: RubricJudgeSchema,
      system: RUBRIC_JUDGE_SYSTEM,
      prompt: buildRubricJudgePrompt(ctx, rubric),
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
  options: Pick<GradeOptions, "timeoutMs" | "model"> = {},
): Promise<PracticeGradeResult> {
  const ctx = judgeContext(input)
  const output = await callWithTimeout(
    llm,
    {
      schema: HolisticJudgeSchema,
      system: HOLISTIC_JUDGE_SYSTEM,
      prompt: buildHolisticJudgePrompt(ctx),
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

/** Full grade for a typed answer with gold available. Never throws on LLM failure. */
export async function runGradePipeline(
  input: GradeInput,
  options: GradeOptions,
): Promise<PracticeGradeResult> {
  const rubric = options.graderV2 ? (input.rubric ?? null) : null
  const started = Date.now()
  const finish = (result: PracticeGradeResult, router: RouterDecision): PracticeGradeResult => ({
    ...result,
    router,
    latency_ms: Date.now() - started,
  })

  if (rubric && isNumericOnlyRubric(rubric)) {
    return finish(gradeNumericRubric(input, rubric), { llm: false, reason: "numeric_only", model: null })
  }

  const deterministic = rubric ? gradeRubricDeterministic(input, rubric) : deterministicNoRubric(input)
  const llmAvailable = Boolean(options.llm)
  let decision: RouterDecision =
    options.router === false && llmAvailable
      ? { llm: true, reason: rubric ? "ambiguous" : "no_rubric", model: options.model ?? null }
      : routeGrade({
          responseText: input.responseText,
          rubric,
          goldConcise: input.goldConcise,
          goldExpanded: input.goldExpanded,
          questionWording: input.questionWording,
          deterministic,
          injection: detectInjection(input.responseText),
          llmAvailable,
          model: options.model ?? null,
        })

  if (decision.llm && options.llm && options.allowLlm && !(await options.allowLlm())) {
    decision = { llm: false, reason: "rate_limited", model: null }
  }

  if (decision.llm && options.llm) {
    try {
      const graded = rubric
        ? await gradeRubricWithLlm(input, rubric, options.llm, options)
        : await gradeHolisticWithLlm(input, options.llm, options)
      return finish(graded, decision)
    } catch (err) {
      options.onLlmError?.(err)
    }
  }
  return finish(deterministic, decision)
}
