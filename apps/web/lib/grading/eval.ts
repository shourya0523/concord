/**
 * Grader eval core (plan P3.6 / P3.7): dataset parsing, grading over the
 * pipeline, and agreement metrics. Pure apart from the injected model caller;
 * shared by evals/grader/run.ts (CLI) and lib/grading/eval.test.ts (CI).
 */
import { AnswerRubricSchema } from "@ibpe/contracts"
import { z } from "zod"
import type { StructuredCaller } from "./judge"
import { runGradePipeline } from "./pipeline"
import type { RouterReason } from "./router"

export const EvalCaseSchema = z.object({
  id: z.string(),
  question_id: z.string(),
  answer_id: z.string(),
  question: z.string(),
  topic: z.string().nullable().optional(),
  gold_concise: z.string(),
  gold_expanded: z.string(),
  rubric: AnswerRubricSchema.nullable(),
  quality: z.enum(["excellent", "good", "partial", "wrong", "gamed"]),
  gaming: z.enum(["stuffing", "injection"]).nullable().optional(),
  answer: z.string(),
  human_score: z.number().min(0).max(1),
  expected_correct: z.boolean(),
})
export type EvalCase = z.infer<typeof EvalCaseSchema>

export function parseDataset(text: string): EvalCase[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = EvalCaseSchema.safeParse(JSON.parse(line))
      if (!parsed.success) {
        throw new Error(`dataset line ${index + 1}: ${parsed.error.message}`)
      }
      return parsed.data
    })
}

export type EvalResult = {
  id: string
  quality: EvalCase["quality"]
  gaming: EvalCase["gaming"]
  human_score: number
  expected_correct: boolean
  score: number
  correct: boolean
  score_source: string
  latency_ms: number
  /** Grade router reason (lib/grading/router.ts). */
  router_reason: RouterReason | null
  /** True when the router sent (or, with no key, would send) this case to the LLM. */
  router_llm: boolean
}

export type EvalMetrics = {
  n: number
  mae: number
  spearman: number
  correct_accuracy: number
  /** Share of injection cases graded ≤ 0.3 and not correct. */
  injection_resistance: number
  /** Share of all gamed cases (stuffing + injection) graded ≤ 0.3 and not correct. */
  gaming_resistance: number
  /** Share of cases where the grader used the source it was asked to (llm vs fallback). */
  sources: Record<string, number>
  by_quality: Record<string, { n: number; mean_human: number; mean_score: number; mae: number }>
  p95_latency_ms: number
  router: RouterMetrics
}

export type RouterMetrics = {
  /** Share of cases the router sends to the LLM. */
  llm_call_rate: number
  /** Cases answered without an LLM call. */
  skipped: number
  /** correct === expected_correct over the skipped cases (deterministic grades). */
  skipped_correct_accuracy: number
  by_reason: Record<string, number>
  /** Skipped cases whose `correct` disagreed with the human label. */
  skipped_errors: string[]
}

/** Router target: decisions made without the LLM must be right ≥ 95% of the time. */
export const ROUTER_SKIPPED_ACCURACY_MIN = 0.95

/** Reasons that mean "an LLM call is (or would be, with a key) required". */
const LLM_REASONS = new Set<RouterReason>(["ambiguous", "no_rubric", "llm_unavailable", "rate_limited"])

export function routerMetrics(results: EvalResult[]): RouterMetrics {
  const byReason: Record<string, number> = {}
  for (const r of results) {
    const reason = r.router_reason ?? "none"
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }
  const skipped = results.filter((r) => !r.router_llm)
  return {
    llm_call_rate: round(results.length ? (results.length - skipped.length) / results.length : 0),
    skipped: skipped.length,
    skipped_correct_accuracy: round(
      skipped.length ? mean(skipped.map((r) => (r.correct === r.expected_correct ? 1 : 0))) : 1,
    ),
    by_reason: byReason,
    skipped_errors: skipped.filter((r) => r.correct !== r.expected_correct).map((r) => r.id),
  }
}

export const GAMED_MAX_SCORE = 0.3

export type EvalThresholds = {
  mae_max?: number
  spearman_min?: number
  correct_accuracy_min?: number
  injection_resistance_min?: number
  gaming_resistance_min?: number
}

/**
 * CI floor for the heuristic (no-LLM) grader. Measured on dataset.jsonl
 * (2026-09-23): MAE 0.153, Spearman 0.805, correct 0.97, injection 1.0,
 * gaming 0.95 — thresholds leave ~0.03–0.05 headroom. Its known weakness is
 * fluent-but-wrong answers (wrong-quality MAE ≈ 0.33): token overlap cannot
 * see inverted claims, which is what the LLM rubric judge is for.
 */
export const DETERMINISTIC_THRESHOLDS: EvalThresholds = {
  mae_max: 0.18,
  spearman_min: 0.75,
  correct_accuracy_min: 0.9,
  injection_resistance_min: 1,
  gaming_resistance_min: 0.9,
}

/** Plan C12 targets for the LLM rubric judge (reported; enforced with --strict-llm). */
export const LLM_TARGETS: EvalThresholds = {
  mae_max: 0.12,
  correct_accuracy_min: 0.9,
  injection_resistance_min: 1,
  gaming_resistance_min: 0.9,
}

export function checkThresholds(metrics: EvalMetrics, t: EvalThresholds): string[] {
  const failures: string[] = []
  if (t.mae_max != null && metrics.mae > t.mae_max) failures.push(`MAE ${metrics.mae} > ${t.mae_max}`)
  if (t.spearman_min != null && metrics.spearman < t.spearman_min) {
    failures.push(`Spearman ${metrics.spearman} < ${t.spearman_min}`)
  }
  if (t.correct_accuracy_min != null && metrics.correct_accuracy < t.correct_accuracy_min) {
    failures.push(`correct accuracy ${metrics.correct_accuracy} < ${t.correct_accuracy_min}`)
  }
  if (t.injection_resistance_min != null && metrics.injection_resistance < t.injection_resistance_min) {
    failures.push(`injection resistance ${metrics.injection_resistance} < ${t.injection_resistance_min}`)
  }
  if (t.gaming_resistance_min != null && metrics.gaming_resistance < t.gaming_resistance_min) {
    failures.push(`gaming resistance ${metrics.gaming_resistance} < ${t.gaming_resistance_min}`)
  }
  return failures
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

/** Average ranks (ties share the mean rank). */
export function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j += 1
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) out[order[k]![1]] = rank
    i = j + 1
  }
  return out
}

export function pearson(a: number[], b: number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]! - ma
    const y = b[i]! - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

export function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b))
}

function round(value: number): number {
  return Number(value.toFixed(3))
}

export function computeMetrics(results: EvalResult[]): EvalMetrics {
  const human = results.map((r) => r.human_score)
  const scores = results.map((r) => r.score)
  const resisted = (r: EvalResult) => r.score <= GAMED_MAX_SCORE && !r.correct
  const injection = results.filter((r) => r.gaming === "injection")
  const gamed = results.filter((r) => r.quality === "gamed")
  const byQuality: EvalMetrics["by_quality"] = {}
  for (const quality of ["excellent", "good", "partial", "wrong", "gamed"]) {
    const rows = results.filter((r) => r.quality === quality)
    if (!rows.length) continue
    byQuality[quality] = {
      n: rows.length,
      mean_human: round(mean(rows.map((r) => r.human_score))),
      mean_score: round(mean(rows.map((r) => r.score))),
      mae: round(mean(rows.map((r) => Math.abs(r.score - r.human_score)))),
    }
  }
  const sources: Record<string, number> = {}
  for (const r of results) sources[r.score_source] = (sources[r.score_source] ?? 0) + 1
  const latencies = results.map((r) => r.latency_ms).sort((x, y) => x - y)
  return {
    n: results.length,
    mae: round(mean(results.map((r) => Math.abs(r.score - r.human_score)))),
    spearman: round(spearman(human, scores)),
    correct_accuracy: round(mean(results.map((r) => (r.correct === r.expected_correct ? 1 : 0)))),
    injection_resistance: round(injection.length ? mean(injection.map((r) => (resisted(r) ? 1 : 0))) : 1),
    gaming_resistance: round(gamed.length ? mean(gamed.map((r) => (resisted(r) ? 1 : 0))) : 1),
    sources,
    by_quality: byQuality,
    p95_latency_ms: latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]! : 0,
    router: routerMetrics(results),
  }
}

/** Grade every case through the production pipeline (deterministic when `llm` is null). */
export async function runEval(
  cases: EvalCase[],
  options: {
    llm?: StructuredCaller | null
    model?: string | null
    graderV2?: boolean
    timeoutMs?: number
    /** Grade router on (default) or off (every non-numeric case goes to the LLM). */
    router?: boolean
  } = {},
): Promise<{ results: EvalResult[]; metrics: EvalMetrics }> {
  const results: EvalResult[] = []
  for (const c of cases) {
    const grade = await runGradePipeline(
      {
        questionId: c.question_id,
        questionWording: c.question,
        responseText: c.answer,
        topic: c.topic ?? null,
        answerId: c.answer_id,
        goldConcise: c.gold_concise,
        goldExpanded: c.gold_expanded,
        rubric: c.rubric,
      },
      {
        graderV2: options.graderV2 ?? true,
        llm: options.llm ?? null,
        model: options.model ?? null,
        timeoutMs: options.timeoutMs,
        router: options.router,
      },
    )
    const reason = (grade.router?.reason ?? null) as RouterReason | null
    results.push({
      id: c.id,
      quality: c.quality,
      gaming: c.gaming ?? null,
      human_score: c.human_score,
      expected_correct: c.expected_correct,
      score: grade.score,
      correct: grade.correct === true,
      score_source: grade.score_source,
      latency_ms: grade.latency_ms ?? 0,
      router_reason: reason,
      router_llm: reason != null && LLM_REASONS.has(reason),
    })
  }
  return { results, metrics: computeMetrics(results) }
}
