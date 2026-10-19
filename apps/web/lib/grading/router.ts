/**
 * Grade router: decides whether a typed answer needs an LLM call at all
 * ("very small LLM only when required"). Pure — no I/O, no server imports.
 *
 * No LLM when
 *   - the answer is empty, a reveal-copy, a cache hit, or flagged as injection
 *   - the rubric is numeric-only (code checks the numbers)
 *   - a hard shape guard fired (keyword list / repetition): the LLM path
 *     applies the same sub-pass ceiling, so a call cannot change the verdict
 *   - the deterministic rubric pre-grade is decisive:
 *       pass  every must-have's cues hit (optional points hit or partial), no
 *             stuffing guard fired, no numeric check failed and deterministic
 *             score ≥ DECISIVE_PASS_SCORE
 *       fail  zero cue hits on every key point, no numeric check passed and
 *             the answer is short or off-topic vs the teaching answer
 * Otherwise a model grades it: ONE Jev decision request (typed verdict per key
 * point), escalating to the SMALL chat model only on low confidence / error
 * (lib/grading/pipeline.ts). The outcome is recorded as a GradeRoute.
 *
 * Thresholds were tuned on evals/grader/dataset.jsonl (2026-09-23): LLM call
 * rate 0.48, 52 skipped cases with deterministic correct-accuracy 1.00
 * (target ≥ 0.95). Score floors 0.80–0.90 give the same accuracy; 0.9 kept for
 * margin. See evals/grader/README.md.
 */
import type { AnswerRubric } from "@ibpe/contracts"
import type { PracticeGradeResult } from "../practice-grade-core"
import { isNumericOnlyRubric } from "./rubric"
import { contentTokens, stem, wordTokens, STOP_WORDS } from "./text"

export const DECISIVE_PASS_SCORE = 0.9
/** "Short" answers: fewer content tokens than this. */
export const DECISIVE_FAIL_MAX_TOKENS = 12
/** "Off-topic": share of answer content tokens found in question + gold + rubric. */
export const DECISIVE_FAIL_MAX_OVERLAP = 0.25

export type RouterReason =
  | "empty_answer"
  | "reveal_copy"
  | "cache_hit"
  | "injection"
  | "numeric_only"
  | "decisive_pass"
  | "decisive_fail"
  | "stuffing"
  | "llm_unavailable"
  | "rate_limited"
  | "ambiguous"
  | "no_rubric"

export type RouterDecision = {
  /** True when a model (Jev, then maybe the small chat model) should grade. */
  llm: boolean
  reason: RouterReason
  /** Decision model the call goes to; null when no call is made. */
  model: string | null
}

/**
 * How a grade was produced — persisted as `grade_json.router`.
 *
 *   skip           no model needed (router skip reason in `reason`)
 *   jev            Jev decisions only
 *   jev+small      Jev, then the small chat model (see `escalation`)
 *   small          small chat model only (no decision model configured)
 *   deterministic  a model was needed but unavailable / rate-limited / failed
 */
export type GradeRoutePath = "skip" | "jev" | "jev+small" | "small" | "deterministic"

/** Why the small chat model was called (or attempted) after Jev. */
export type EscalationReason = "low_confidence" | "jev_error"

export type GradeRoute = {
  path: GradeRoutePath
  reason: RouterReason
  escalation: EscalationReason | null
  /** Jev model that answered (null when Jev was not called). */
  decision_model: string | null
  /** Small chat model that graded (null when not called). */
  chat_model: string | null
  /** OpenRouter usage cost (USD) across every call for this grade; null when none reported. */
  cost_usd: number | null
}

/** GradeRoute for a router decision that made no model call. */
export function routeWithoutModel(decision: Pick<RouterDecision, "reason">): GradeRoute {
  const needed = decision.reason === "llm_unavailable" || decision.reason === "rate_limited"
  return {
    path: needed ? "deterministic" : "skip",
    reason: decision.reason,
    escalation: null,
    decision_model: null,
    chat_model: null,
    cost_usd: null,
  }
}

export type RouterInput = {
  responseText: string
  rubric: AnswerRubric | null
  goldConcise?: string
  goldExpanded?: string
  questionWording?: string
  /** Deterministic pre-grade (heuristic rubric or overlap grade). */
  deterministic?: Pick<PracticeGradeResult, "score" | "rubric_items" | "numeric_checks" | "rubric_json"> | null
  cacheHit?: boolean
  revealCopy?: boolean
  injection?: boolean
  /** A model caller is configured (key present, not rate-limited). */
  llmAvailable: boolean
  /** Primary-tier model id recorded on the decision. */
  model?: string | null
}

const skip = (reason: RouterReason): RouterDecision => ({ llm: false, reason, model: null })

function stemmedContent(text: string): string[] {
  return wordTokens(text)
    .filter((t) => !STOP_WORDS.has(t) && t.length > 1)
    .map(stem)
}

/** Share of the answer's content tokens that appear in the question / gold / rubric. */
export function topicOverlap(answer: string, reference: string): number {
  const tokens = stemmedContent(answer)
  if (tokens.length === 0) return 0
  const ref = new Set(stemmedContent(reference))
  return tokens.filter((t) => ref.has(t)).length / tokens.length
}

function coverageMap(json: Record<string, unknown> | undefined): Record<string, number> {
  const raw = json?.coverage
  return raw && typeof raw === "object" ? (raw as Record<string, number>) : {}
}

function stuffingReasons(json: Record<string, unknown> | undefined): string[] {
  const raw = json?.stuffing_reasons
  return Array.isArray(raw) ? (raw as string[]) : []
}

/**
 * Shape guards the LLM path also applies with a ceiling below the pass mark
 * (keyword list → 0.2, repetition → 0.4): an LLM call cannot change the verdict.
 */
const HARD_SHAPE_REASONS = new Set(["keyword_list", "repetition"])

export function isShapeCapped(input: RouterInput): boolean {
  return stuffingReasons(input.deterministic?.rubric_json).some((r) => HARD_SHAPE_REASONS.has(r))
}

/** True when the deterministic rubric pre-grade is a clear pass. */
export function isDecisivePass(input: RouterInput): boolean {
  const det = input.deterministic
  if (!input.rubric || !det) return false
  const items = det.rubric_items
  if (items.length === 0 || items.length !== input.rubric.key_points.length) return false
  // Every must-have hit; optional points may be partial (score floor still applies).
  if (!items.every((i) => i.verdict === "hit" || (!i.must_have && i.verdict === "partial"))) return false
  if (det.numeric_checks.some((n) => !n.pass)) return false
  if (stuffingReasons(det.rubric_json).length > 0) return false
  return det.score >= DECISIVE_PASS_SCORE
}

/** True when the deterministic rubric pre-grade is a clear fail (nothing on-topic). */
export function isDecisiveFail(input: RouterInput): boolean {
  const det = input.deterministic
  if (!input.rubric || !det) return false
  const coverage = coverageMap(det.rubric_json)
  const zeroCues =
    det.rubric_items.length > 0 &&
    det.rubric_items.every((i) => i.verdict === "miss" && (coverage[i.id] ?? 0) === 0)
  if (!zeroCues) return false
  if (det.numeric_checks.some((n) => n.pass)) return false
  const short = contentTokens(input.responseText).length < DECISIVE_FAIL_MAX_TOKENS
  const reference = [
    input.questionWording ?? "",
    input.goldConcise ?? "",
    input.goldExpanded ?? "",
    ...input.rubric.key_points.map((k) => `${k.text} ${(k.cues ?? []).join(" ")}`),
  ].join(" ")
  const offTopic = topicOverlap(input.responseText, reference) < DECISIVE_FAIL_MAX_OVERLAP
  return short || offTopic
}

/**
 * Decide whether to call the LLM. Order matters: cheap guards first, then
 * the rubric shape, then whether a caller exists, then the pre-grade.
 */
export function routeGrade(input: RouterInput): RouterDecision {
  if (!input.responseText.trim()) return skip("empty_answer")
  if (input.revealCopy) return skip("reveal_copy")
  if (input.cacheHit) return skip("cache_hit")
  if (input.injection) return skip("injection")
  if (input.rubric && isNumericOnlyRubric(input.rubric)) return skip("numeric_only")
  if (input.rubric) {
    if (isShapeCapped(input)) return skip("stuffing")
    if (isDecisivePass(input)) return skip("decisive_pass")
    if (isDecisiveFail(input)) return skip("decisive_fail")
  }
  if (!input.llmAvailable) return skip("llm_unavailable")
  return { llm: true, reason: input.rubric ? "ambiguous" : "no_rubric", model: input.model ?? null }
}
