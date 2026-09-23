/**
 * Pure practice grading helpers (no server / path-alias imports).
 *
 * `gradeDeterministic` is the no-LLM, no-rubric fallback (global overlap vs
 * the teaching answer, hardened against keyword stuffing and injection).
 * Rubric-aware grading lives in lib/grading/pipeline.ts.
 */
import type {
  AttemptGradeCitation,
  AttemptScoreSource,
  NumericCheckResult,
  RubricItemResult,
} from "@ibpe/contracts"
import {
  assessStuffing,
  capForInjection,
  detectInjection,
  INJECTION_RED_FLAG,
} from "./grading/guards"
import { PASS_THRESHOLD, RED_FLAG_PENALTY } from "./grading/rubric"
import { contentTokens, stem, tokenSet, wordTokens } from "./grading/text"

export type HeatTopicCue = {
  firm_id: string
  topic_id: string
  intensity: number
  sample_size: number
}

export const GRADER_V1 = "grader-v1"
export const GRADER_SELF = "self"

export type PracticeGradeResult = {
  score: number
  correct: boolean | null
  score_source: AttemptScoreSource
  feedback: string
  weak_topics: string[]
  citations: AttemptGradeCitation[]
  /** Grader diagnostics (coverage, caps, model ids…) — persisted inside grade_json. */
  rubric_json: Record<string, unknown>
  answer_id: string | null
  grader_version: string
  rubric_items: RubricItemResult[]
  numeric_checks: NumericCheckResult[]
  red_flags_triggered: string[]
  follow_up: string | null
  model?: string | null
  cached?: boolean
  latency_ms?: number
  /** Grade router decision (lib/grading/router.ts) — persisted as grade_json.router. */
  router?: { llm: boolean; reason: string; model: string | null }
}

/** Topic is weak (for weak_topics) below proficient mastery. */
export const WEAK_GRADE_THRESHOLD = 0.68

export function buildCitations(
  answerId: string | null | undefined,
  heatTopics: HeatTopicCue[] = [],
  limit = 3,
): AttemptGradeCitation[] {
  const citations: AttemptGradeCitation[] = []
  if (answerId) {
    citations.push({ id: answerId, kind: "teaching_answer", label: "Teaching answer" })
  }
  for (const h of heatTopics.slice(0, limit)) {
    citations.push({
      id: `heat:${h.firm_id}:${h.topic_id}`,
      kind: "heat_topic",
      label: `${h.topic_id} (intensity ${h.intensity.toFixed(2)})`,
    })
  }
  return citations
}

export function firmHeatNote(citations: AttemptGradeCitation[], score: number): string {
  const heat = citations.filter((c) => c.kind === "heat_topic")
  if (heat.length === 0 || score >= 0.85) return ""
  return ` Firm heat context suggests emphasis on ${heat
    .map((c) => c.label)
    .join("; ")} — coaching only, not gold answers.`
}

/** Deterministic overlap + optional formula / mistake cues (no LLM, no rubric). */
export function gradeDeterministic(options: {
  responseText: string
  goldConcise: string
  goldExpanded?: string
  commonMistakes?: string[]
  formulae?: string[]
  topic?: string | null
  answerId?: string | null
  heatTopics?: HeatTopicCue[]
}): PracticeGradeResult {
  const response = options.responseText.trim()
  const gold = `${options.goldConcise}\n${options.goldExpanded ?? ""}`
  const goldToks = [...new Set(contentTokens(gold))]
  const respToks = tokenSet(response)
  // Show learners real words ("income"), not stems ("incom").
  const display = new Map<string, string>()
  for (const word of wordTokens(gold)) {
    const key = stem(word)
    if (!display.has(key)) display.set(key, word)
  }
  const hit = goldToks.filter((t) => respToks.has(t)).map((t) => display.get(t) ?? t)
  const coverage =
    goldToks.length === 0 ? 0 : hit.length / Math.min(goldToks.length, 24)

  let score = Math.max(0, Math.min(1, coverage))
  const formulae = options.formulae ?? []
  if (formulae.length > 0) {
    const formulaHit = formulae.some((f) =>
      contentTokens(f).some((t) => respToks.has(t)),
    )
    if (formulaHit) score = Math.min(1, score + 0.15)
  }

  const mistakes = options.commonMistakes ?? []
  const mistakeHit = mistakes.some((m) => {
    const mt = contentTokens(m).slice(0, 4)
    return mt.length > 0 && mt.every((t) => respToks.has(t))
  })
  if (mistakeHit) score = Math.max(0, score - 0.2)

  const stuffing = assessStuffing(response, options.goldConcise || gold)
  score = Math.min(score, stuffing.cap)

  const injection = detectInjection(response)
  const red_flags_triggered = injection ? [INJECTION_RED_FLAG] : []
  if (injection) score = capForInjection(Math.max(0, score - RED_FLAG_PENALTY), true)

  score = Number(score.toFixed(3))
  const citations = buildCitations(options.answerId, options.heatTopics)
  const weak_topics: string[] = []
  if (score < WEAK_GRADE_THRESHOLD && options.topic) weak_topics.push(options.topic)

  return {
    score,
    correct: score >= PASS_THRESHOLD && !injection,
    score_source: "deterministic",
    feedback:
      `Coverage vs teaching answer ~${Math.round(score * 100)}%.` +
      (hit.length ? ` Matched cues: ${hit.slice(0, 8).join(", ")}.` : "") +
      (injection ? " Instructions to the grader were ignored and penalised." : "") +
      firmHeatNote(citations, score),
    weak_topics,
    citations,
    rubric_json: {
      coverage: Number(coverage.toFixed(3)),
      matched_cues: hit.slice(0, 16),
      mistake_flag: mistakeHit,
      stuffing_cap: stuffing.cap,
      stuffing_reasons: stuffing.reasons,
    },
    answer_id: options.answerId ?? null,
    grader_version: GRADER_V1,
    rubric_items: [],
    numeric_checks: [],
    red_flags_triggered,
    follow_up: null,
  }
}

export function selfGrade(options: {
  correct?: boolean | null
  confidence?: number | null
  topic?: string | null
}): PracticeGradeResult {
  const score =
    options.correct === true
      ? 1
      : options.correct === false
        ? 0.25
        : options.confidence == null
          ? 0.5
          : options.confidence
  return {
    score,
    correct: options.correct ?? null,
    score_source: "self",
    feedback: "Self-rated attempt (no response text or grader unavailable).",
    weak_topics: score < WEAK_GRADE_THRESHOLD && options.topic ? [options.topic] : [],
    citations: [],
    rubric_json: { self: true },
    answer_id: null,
    grader_version: GRADER_SELF,
    rubric_items: [],
    numeric_checks: [],
    red_flags_triggered: [],
    follow_up: null,
  }
}
