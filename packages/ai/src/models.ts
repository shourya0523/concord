/**
 * Model tiers for the OpenRouter stack (docs/deployment/llm-stack.md).
 *
 *   primary  LLM_PRIMARY_MODEL  quality-sensitive calls (rubric grading judge)
 *   small    LLM_SMALL_MODEL    cheap calls (RAG brief, simulator coaching) and
 *                               the automatic fallback for the primary tier
 *   embed    LLM_EMBED_MODEL    RAG embeddings (768-d, pgvector column in migration 033)
 *   stt      LLM_STT_MODEL      voice-answer transcription
 *
 * Every id is an OpenRouter model slug (`vendor/model`). Pure env reads — no I/O.
 */

/**
 * PLACEHOLDER until the owner sets `LLM_PRIMARY_MODEL` to Jev's OpenRouter slug
 * (Jev is not in OpenRouter's public catalog as of 2026-09-23).
 */
export const DEFAULT_PRIMARY_MODEL = "deepseek/deepseek-v4.1-flash"
/**
 * Very small / cheap model. Documented alternatives: `z-ai/glm-4.7-flash`,
 * `google/gemini-2.5-flash-lite`.
 */
export const DEFAULT_SMALL_MODEL = "deepseek/deepseek-v4-flash"
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small"
/** Must match the pgvector(768) column in migration 033. */
export const DEFAULT_EMBED_DIMS = 768
export const DEFAULT_STT_MODEL = "openai/whisper-large-v3-turbo"

export type LlmTier = "primary" | "small"

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

export function openRouterApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return read(env, "OPENROUTER_API_KEY")
}

/** True when chat / embeddings / transcription can call OpenRouter. */
export function isLlmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(openRouterApiKey(env))
}

/**
 * Primary tier. Legacy `GRADER_MODEL` still overrides it for grader bake-offs,
 * but only when it is an OpenRouter slug (`vendor/model`) — bare Gemini ids
 * from the old direct-Google setup are ignored.
 */
export function primaryModel(env: NodeJS.ProcessEnv = process.env): string {
  const bakeOff = read(env, "GRADER_MODEL")
  if (bakeOff && bakeOff.includes("/")) return bakeOff
  return read(env, "LLM_PRIMARY_MODEL") ?? DEFAULT_PRIMARY_MODEL
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

export function modelForTier(tier: LlmTier, env: NodeJS.ProcessEnv = process.env): string {
  return tier === "primary" ? primaryModel(env) : smallModel(env)
}

/**
 * Ordered model list sent as OpenRouter's `models` fallback array: the primary
 * tier falls back to the small model; the small tier has no fallback.
 */
export function tierModels(tier: LlmTier, env: NodeJS.ProcessEnv = process.env): string[] {
  if (tier === "small") return [smallModel(env)]
  return [...new Set([primaryModel(env), smallModel(env)])]
}
