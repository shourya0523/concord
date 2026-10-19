/**
 * Model tiers for the OpenRouter stack (docs/deployment/llm-stack.md).
 *
 *   decision  LLM_DECISION_MODEL  Jev (TypeSafe) typed decisions — grading,
 *                                  draft verification. Not an LLM: POST
 *                                  /api/alpha/decisions, billed on input only.
 *   small     LLM_SMALL_MODEL     the ONLY generative chat model (RAG brief,
 *                                  simulator coaching drafts, grader escalation)
 *   embed     LLM_EMBED_MODEL     RAG embeddings (768-d, pgvector column in migration 033)
 *   stt       LLM_STT_MODEL       voice-answer transcription
 *
 * Every id is an OpenRouter model slug (`vendor/model`). Pure env reads — no I/O.
 */

/** Jev pinned to 1.13 so confidence thresholds stay tuned to one release. */
export const DEFAULT_DECISION_MODEL = "typesafe/jev-1.13"
/**
 * Very small / cheap chat model. Documented alternatives: `z-ai/glm-4.7-flash`,
 * `google/gemini-2.5-flash-lite`.
 */
export const DEFAULT_SMALL_MODEL = "deepseek/deepseek-v4-flash"
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small"
/** Must match the pgvector(768) column in migration 033. */
export const DEFAULT_EMBED_DIMS = 768
export const DEFAULT_STT_MODEL = "openai/whisper-large-v3-turbo"

/** Grader: escalate to the small chat model when a must-have's Jev confidence is below this. */
export const DEFAULT_JEV_CONFIDENCE_FLOOR = 0.6
/** Cascade: ship a small-model draft only when Jev says `supported` at or above this. */
export const DEFAULT_JEV_ACCEPT_CONFIDENCE = 0.8

/** Chat tiers. Only the small model generates text; decisions go to Jev. */
export type LlmTier = "small"

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

export function openRouterApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return read(env, "OPENROUTER_API_KEY")
}

/** True when chat / decisions / embeddings / transcription can call OpenRouter. */
export function isLlmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(openRouterApiKey(env))
}

/** Jev on OpenRouter: `typesafe/jev-*` or the `~typesafe/jev-latest` alias. */
export function isJevModel(id: string | null | undefined): boolean {
  return typeof id === "string" && /^~?typesafe\/jev[-\w.]*$/i.test(id.trim())
}

let warnedGraderModel = false

/** Test seam: re-arm the one-time GRADER_MODEL warning. */
export function resetModelWarnings(): void {
  warnedGraderModel = false
}

/**
 * Decision tier (Jev). Legacy `GRADER_MODEL` overrides it only when it names a
 * Jev release (bake-offs between Jev versions); any other value is ignored
 * with a one-time warning, since chat models no longer grade by default.
 */
export function decisionModel(env: NodeJS.ProcessEnv = process.env): string {
  const bakeOff = read(env, "GRADER_MODEL")
  if (bakeOff) {
    if (isJevModel(bakeOff)) return bakeOff
    if (!warnedGraderModel) {
      warnedGraderModel = true
      console.warn(
        `[llm] GRADER_MODEL=${bakeOff} ignored: the grader runs on Jev (LLM_DECISION_MODEL); ` +
          "set LLM_SMALL_MODEL to change the escalation chat model",
      )
    }
  }
  return read(env, "LLM_DECISION_MODEL") ?? DEFAULT_DECISION_MODEL
}

export function smallModel(env: NodeJS.ProcessEnv = process.env): string {
  return read(env, "LLM_SMALL_MODEL") ?? DEFAULT_SMALL_MODEL
}

export function embedModel(env: NodeJS.ProcessEnv = process.env): string {
  return read(env, "LLM_EMBED_MODEL") ?? DEFAULT_EMBED_MODEL
}

export function sttModel(env: NodeJS.ProcessEnv = process.env): string {
  return read(env, "LLM_STT_MODEL") ?? DEFAULT_STT_MODEL
}

export function modelForTier(_tier: LlmTier = "small", env: NodeJS.ProcessEnv = process.env): string {
  return smallModel(env)
}

/** Ordered model list for a chat tier (the small tier has no fallback). */
export function tierModels(_tier: LlmTier = "small", env: NodeJS.ProcessEnv = process.env): string[] {
  return [smallModel(env)]
}

function readUnit(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = read(env, name)
  if (raw == null) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/** JEV_CONFIDENCE_FLOOR (0–1, default 0.6): grader escalation threshold. */
export function jevConfidenceFloor(env: NodeJS.ProcessEnv = process.env): number {
  return readUnit(env, "JEV_CONFIDENCE_FLOOR", DEFAULT_JEV_CONFIDENCE_FLOOR)
}

/** JEV_ACCEPT_CONFIDENCE (0–1, default 0.8): verified-cascade acceptance threshold. */
export function jevAcceptConfidence(env: NodeJS.ProcessEnv = process.env): number {
  return readUnit(env, "JEV_ACCEPT_CONFIDENCE", DEFAULT_JEV_ACCEPT_CONFIDENCE)
}
