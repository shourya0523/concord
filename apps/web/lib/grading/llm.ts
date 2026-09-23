/**
 * Production model caller for the grader (AI SDK). Returns null when no
 * credentials are configured so every path degrades to deterministic.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { googleApiKey, gradeModelConfig, type GradeModelConfig } from "@ibpe/ai"
import { generateText, Output } from "ai"
import type { StructuredCaller } from "./judge"

export type GradeUsage = {
  model: string
  input_tokens: number | null
  output_tokens: number | null
}

export function createGradeCaller(options: {
  config?: GradeModelConfig
  onUsage?: (usage: GradeUsage) => void
} = {}): { caller: StructuredCaller; model: string } | null {
  const config = options.config ?? gradeModelConfig()
  if (!config.available) return null
  const google =
    config.route === "google" ? createGoogleGenerativeAI({ apiKey: googleApiKey() }) : null

  const caller: StructuredCaller = async (request) => {
    const result = await generateText({
      model: google ? google(config.model) : config.model,
      output: Output.object({ schema: request.schema }),
      system: request.system,
      prompt: request.prompt,
      temperature: 0,
      maxRetries: 0,
      abortSignal: request.signal,
    })
    options.onUsage?.({
      model: config.model,
      input_tokens: result.usage?.inputTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
    })
    return result.output as never
  }
  return { caller, model: config.model }
}
