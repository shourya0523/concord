/**
 * Production model caller for the grader: the rubric judge runs on the
 * PRIMARY tier via OpenRouter (`chatJson`), with the SMALL tier as
 * OpenRouter's automatic fallback. Returns null when OPENROUTER_API_KEY is
 * missing so every path degrades to deterministic.
 */
import { chatJson, gradeModelConfig, type ClientOptions, type GradeModelConfig } from "@ibpe/ai"
import type { StructuredCaller } from "./judge"

export type GradeUsage = {
  /** Model that actually answered (the fallback when the primary errored). */
  model: string
  input_tokens: number | null
  output_tokens: number | null
  /** USD from OpenRouter usage accounting, when returned. */
  cost?: number | null
}

export function createGradeCaller(options: {
  config?: GradeModelConfig
  onUsage?: (usage: GradeUsage) => void
  /** Test seam: fetch/env/key for the OpenRouter client. */
  client?: ClientOptions
} = {}): { caller: StructuredCaller; model: string } | null {
  const config = options.config ?? gradeModelConfig(options.client?.env)
  if (!config.available) return null

  const caller: StructuredCaller = async (request) => {
    const result = await chatJson(
      request.schema,
      {
        // Primary tier first, small tier as OpenRouter's fallback.
        models: config.fallbackModel ? [config.model, config.fallbackModel] : [config.model],
        schemaName: "grade",
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        temperature: 0,
        maxTokens: 1200,
        signal: request.signal,
      },
      options.client,
    )
    options.onUsage?.({
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cost: result.usage.cost,
    })
    return result.object
  }
  return { caller, model: config.model }
}
