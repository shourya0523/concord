/**
 * Typed client for OpenRouter's Decisions API — Jev (TypeSafe), the decision
 * tier in ./models.ts (docs/vendor/jev/, docs/deployment/llm-stack.md).
 *
 * Jev is NOT an LLM: it answers typed questions about a `state` object and
 * returns probabilities, never text. All questions in one request are answered
 * in parallel and cannot see each other. Billed on input tokens only; each
 * response carries `usage.cost` (USD).
 *
 *   POST {origin}/api/alpha/decisions   (outside the /api/v1 chat prefix)
 *     origin = origin of OPENROUTER_BASE_URL (default https://openrouter.ai)
 *     OPENROUTER_DECISIONS_URL overrides the full URL
 *
 * Question → answer:
 *   noul   yes/no                      → { type: "noul", noul: p_yes }
 *   choice criteria {label: desc}      → { type: "choice", choice, confidence, probabilities }
 *   score  criteria [ordered labels]   → { type: "score", score, confidence, probabilities, legend }
 *
 * Answers are validated against the questions sent (wrong type, unknown label
 * or missing answer → OpenRouterError "invalid_response"); a missing
 * confidence becomes 0 so it can never pass a threshold. The API key is never
 * logged or echoed in errors. `fetch` and `env` are injectable for tests.
 */
import { decisionModel } from "./models.js"
import {
  DEFAULT_OPENROUTER_BASE_URL,
  OpenRouterError,
  postJsonTo,
  resolveClient,
  type ClientOptions,
} from "./openrouter.js"

export const DECISIONS_PATH = "/api/alpha/decisions"

export type NoulQuestion = {
  type: "noul"
  instructions: string
  /** Optional descriptions of what "yes" / "no" mean. */
  criteria?: { true?: string; false?: string }
}

export type ChoiceQuestion<L extends string = string> = {
  type: "choice"
  instructions?: string
  /** label → description; Jev picks exactly one label. */
  criteria: Record<L, string>
}

export type ScoreQuestion = {
  type: "score"
  instructions?: string
  /** Ordered labels, index 0 first; the score is a probability-weighted index. */
  criteria: readonly string[]
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion
export type DecisionQuestions = Record<string, DecisionQuestion>

export type NoulAnswer = { type: "noul"; /** Probability of yes, 0–1. */ noul: number }

export type ChoiceAnswer<L extends string = string> = {
  type: "choice"
  choice: L
  /** 0–1; 0 when the API omitted it. */
  confidence: number
  probabilities: Record<string, number>
}

export type ScoreAnswer = {
  type: "score"
  /** Probability-weighted index on the ordered criteria (0 … n−1). */
  score: number
  /** 0–1; 0 when the API omitted it. */
  confidence: number
  probabilities: Record<string, number>
  legend: Record<string, string>
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer

export type AnswerFor<Q> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer L>
    ? ChoiceAnswer<L>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : never

export type DecisionAnswers<Qs extends DecisionQuestions> = { [K in keyof Qs]: AnswerFor<Qs[K]> }

export type DecisionUsage = {
  input_tokens: number | null
  output_tokens: number | null
  /** USD, as reported by OpenRouter (`usage.cost`). */
  cost: number | null
}

export type DecisionResult<Qs extends DecisionQuestions = DecisionQuestions> = {
  id: string | null
  /** Dated snapshot that served the request (e.g. typesafe/jev-1.13-20260917). */
  model: string
  provider: string | null
  answers: DecisionAnswers<Qs>
  usage: DecisionUsage
}

export type DecideRequest<Qs extends DecisionQuestions = DecisionQuestions> = {
  state: Record<string, unknown>
  questions: Qs
  /** Defaults to the decision tier (LLM_DECISION_MODEL, typesafe/jev-1.13). */
  model?: string
  signal?: AbortSignal
}

/** Full Decisions URL: OPENROUTER_DECISIONS_URL, else OPENROUTER_BASE_URL's origin + /api/alpha/decisions. */
export function decisionsUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPENROUTER_DECISIONS_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")
  const base = env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL
  let origin: string
  try {
    origin = new URL(base).origin
  } catch {
    origin = new URL(DEFAULT_OPENROUTER_BASE_URL).origin
  }
  return `${origin}${DECISIONS_PATH}`
}

function invalid(message: string): OpenRouterError {
  return new OpenRouterError("invalid_response", `OpenRouter decisions: ${message}`)
}

/** Reject malformed questions before spending a request. */
export function validateQuestions(questions: DecisionQuestions): void {
  const entries = Object.entries(questions)
  if (entries.length === 0) {
    throw new OpenRouterError("bad_request", "OpenRouter decisions: at least one question is required")
  }
  for (const [key, q] of entries) {
    if (!key.trim()) throw new OpenRouterError("bad_request", "OpenRouter decisions: empty question key")
    if (q.type === "noul") {
      if (!q.instructions?.trim()) {
        throw new OpenRouterError("bad_request", `OpenRouter decisions: noul "${key}" needs instructions`)
      }
    } else if (q.type === "choice") {
      if (Object.keys(q.criteria ?? {}).length < 2) {
        throw new OpenRouterError("bad_request", `OpenRouter decisions: choice "${key}" needs ≥ 2 labels`)
      }
    } else if (q.type === "score") {
      if ((q.criteria ?? []).length < 2) {
        throw new OpenRouterError("bad_request", `OpenRouter decisions: score "${key}" needs ≥ 2 levels`)
      }
    } else {
      throw new OpenRouterError("bad_request", `OpenRouter decisions: unknown question type for "${key}"`)
    }
  }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function probabilityMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = finite(value)
    if (n != null) out[key] = clampUnit(n)
  }
  return out
}

function confidenceOf(raw: Record<string, unknown>): number {
  const n = finite(raw.confidence)
  return n == null ? 0 : clampUnit(n)
}

/** Validate raw `answers` against the questions sent (exported for tests). */
export function parseDecisionAnswers<Qs extends DecisionQuestions>(
  questions: Qs,
  rawAnswers: unknown,
): DecisionAnswers<Qs> {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    throw invalid("response has no answers object")
  }
  const answers = rawAnswers as Record<string, unknown>
  const out: Record<string, DecisionAnswer> = {}
  for (const [key, question] of Object.entries(questions)) {
    const raw = answers[key]
    if (!raw || typeof raw !== "object") throw invalid(`missing answer for "${key}"`)
    const a = raw as Record<string, unknown>
    if (a.type !== question.type) throw invalid(`answer "${key}" has type ${String(a.type)}, expected ${question.type}`)
    if (question.type === "noul") {
      const p = finite(a.noul)
      if (p == null) throw invalid(`noul answer "${key}" has no probability`)
      out[key] = { type: "noul", noul: clampUnit(p) }
    } else if (question.type === "choice") {
      const choice = a.choice
      if (typeof choice !== "string" || !Object.prototype.hasOwnProperty.call(question.criteria, choice)) {
        throw invalid(`choice answer "${key}" picked an unknown label`)
      }
      out[key] = { type: "choice", choice, confidence: confidenceOf(a), probabilities: probabilityMap(a.probabilities) }
    } else {
      const score = finite(a.score)
      if (score == null) throw invalid(`score answer "${key}" has no score`)
      const legend: Record<string, string> = {}
      question.criteria.forEach((label, i) => (legend[String(i)] = label))
      const rawLegend = a.legend && typeof a.legend === "object" ? (a.legend as Record<string, unknown>) : {}
      for (const [k, v] of Object.entries(rawLegend)) if (typeof v === "string") legend[k] = v
      out[key] = {
        type: "score",
        score: Math.min(question.criteria.length - 1, Math.max(0, score)),
        confidence: confidenceOf(a),
        probabilities: probabilityMap(a.probabilities),
        legend,
      }
    }
  }
  return out as DecisionAnswers<Qs>
}

type RawDecisionResponse = {
  id?: unknown
  model?: unknown
  provider?: unknown
  answers?: unknown
  usage?: { input_tokens?: unknown; output_tokens?: unknown; cost?: unknown }
}

/** One Decisions request: every question about the same `state`, answered in parallel. */
export async function decide<Qs extends DecisionQuestions>(
  request: DecideRequest<Qs>,
  options: ClientOptions = {},
): Promise<DecisionResult<Qs>> {
  validateQuestions(request.questions)
  const client = resolveClient(options)
  const env = options.env ?? process.env
  const model = request.model ?? decisionModel(env)
  const raw = await postJsonTo<RawDecisionResponse>(
    client,
    decisionsUrl(env),
    DECISIONS_PATH,
    { model, state: request.state, questions: request.questions },
    request.signal,
  )
  const answers = parseDecisionAnswers(request.questions, raw.answers)
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    model: typeof raw.model === "string" ? raw.model : model,
    provider: typeof raw.provider === "string" ? raw.provider : null,
    answers,
    usage: {
      input_tokens: finite(raw.usage?.input_tokens),
      output_tokens: finite(raw.usage?.output_tokens),
      cost: finite(raw.usage?.cost),
    },
  }
}

/** Errors worth one retry / a different tier (rate limit, overload, upstream, network, timeout). */
export function isTransientOpenRouterError(err: unknown): boolean {
  return (
    err instanceof OpenRouterError &&
    ["rate_limited", "overloaded", "upstream", "network", "timeout"].includes(err.code)
  )
}
