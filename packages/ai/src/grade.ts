/**
 * Grader model selection (plan 2026-09-23-001 P0.5 / P3.7).
 *
 * The rubric judge runs on the PRIMARY tier (`LLM_PRIMARY_MODEL`, Jev) via
 * OpenRouter with the SMALL tier as OpenRouter's automatic fallback. Legacy
 * `GRADER_MODEL` (an OpenRouter slug) overrides the primary tier for bake-offs.
 */
import { DEFAULT_PRIMARY_MODEL, isLlmConfigured, primaryModel, smallModel } from "./models.js"

export const DEFAULT_GRADE_MODEL = DEFAULT_PRIMARY_MODEL

export type GradeModelConfig = {
  model: string
  /** Fallback model OpenRouter tries when `model` errors. */
  fallbackModel?: string
  route: "openrouter"
  /** True when OPENROUTER_API_KEY is present. */
  available: boolean
}

export function gradeModelId(env: NodeJS.ProcessEnv = process.env): string {
  return primaryModel(env)
}

export function gradeModelConfig(env: NodeJS.ProcessEnv = process.env): GradeModelConfig {
  const model = gradeModelId(env)
  const fallback = smallModel(env)
  return {
    model,
    ...(fallback !== model ? { fallbackModel: fallback } : {}),
    route: "openrouter",
    available: isLlmConfigured(env),
  }
}
