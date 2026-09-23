/**
 * Grader model selection (plan 2026-09-23-001 P0.5 / P3.7).
 *
 * `GRADER_MODEL` overrides the default so a bake-off can swap models without
 * a code change. Bare ids (`gemini-3.6-flash`) use the Google provider with
 * GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY; `provider/model` ids
 * (`google/gemini-2.5-flash`, `anthropic/…`, `openai/…`) go through the Vercel
 * AI Gateway and need AI_GATEWAY_API_KEY (or Vercel OIDC).
 */
import { googleApiKey } from "./embeddings.js"

/** Flash-class Gemini: cheap + fast enough for an 8 s grading budget. */
export const DEFAULT_GRADE_MODEL = "gemini-3.6-flash"

export type GradeModelConfig = {
  model: string
  /** `google` = direct Gemini key; `gateway` = Vercel AI Gateway model string. */
  route: "google" | "gateway"
  /** True when credentials for `route` are present. */
  available: boolean
}

export function gradeModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.GRADER_MODEL?.trim() || DEFAULT_GRADE_MODEL
}

export function gradeModelConfig(env: NodeJS.ProcessEnv = process.env): GradeModelConfig {
  const model = gradeModelId(env)
  if (model.includes("/")) {
    return {
      model,
      route: "gateway",
      available: Boolean(env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim()),
    }
  }
  return { model, route: "google", available: Boolean(googleApiKey(env)) }
}
