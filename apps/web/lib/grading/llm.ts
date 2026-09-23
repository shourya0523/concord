/**
 * Production model wiring for the grader (docs/deployment/llm-stack.md):
 *
 *   decide  Jev (LLM_DECISION_MODEL) via OpenRouter's Decisions API — one
 *           typed request per attempt
 *   caller  the SMALL chat model (LLM_SMALL_MODEL) running the rubric-judge
 *           prompt — only when the pipeline escalates
 *
 * Returns null when OPENROUTER_API_KEY is missing so every path degrades to
 * deterministic (exactly the pre-Jev behaviour).
 */
import {
  chatJson,
  decide,
  gradeModelConfig,
  type ClientOptions,
  type GradeModelConfig,
} from "@ibpe/ai"
import type { GradeDecider } from "./jev"
import type { StructuredCaller } from "./judge"

export type GradeUsage = {
  kind: "decision" | "chat"
  /** Model (snapshot) that actually answered. */
  model: string
  input_tokens: number | null
  output_tokens: number | null
  /** USD from OpenRouter usage accounting, when returned. */
  cost?: number | null
}

type FactoryOptions = {
  config?: GradeModelConfig
  onUsage?: (usage: GradeUsage) => void
  /** Test seam: fetch/env/key for the OpenRouter client. */
  client?: ClientOptions
}

/** Jev decision caller for the pipeline (`GradeOptions.decide`). */
export function createGradeDecider(options: FactoryOptions = {}): { decide: GradeDecider; model: string } | null {
  const config = options.config ?? gradeModelConfig(options.client?.env)
  if (!config.available) return null
  const decider: GradeDecider = async (request) => {
    const result = await decide(
      { state: request.state, questions: request.questions, model: config.decisionModel, signal: request.signal },
      options.client,
    )
    options.onUsage?.({
      kind: "decision",
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cost: result.usage.cost,
    })
    return { answers: result.answers, model: result.model, usage: result.usage }
  }
  return { decide: decider, model: config.decisionModel }
}

/** Small chat model caller for escalations (`GradeOptions.llm`). */
export function createGradeCaller(options: FactoryOptions = {}): { caller: StructuredCaller; model: string } | null {
  const config = options.config ?? gradeModelConfig(options.client?.env)
  if (!config.available) return null

  const caller: StructuredCaller = async (request) => {
    const result = await chatJson(
      request.schema,
      {
        model: config.chatModel,
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
    const usage = {
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cost: result.usage.cost,
    }
    options.onUsage?.({ kind: "chat", ...usage })
    request.onUsage?.(usage)
    return result.object
  }
  return { caller, model: config.chatModel }
}

export type GradeModels = {
  decide: GradeDecider
  decisionModel: string
  caller: StructuredCaller
  chatModel: string
  confidenceFloor: number
}

/** Both tiers from one config (null without OPENROUTER_API_KEY). */
export function createGradeModels(options: FactoryOptions = {}): GradeModels | null {
  const config = options.config ?? gradeModelConfig(options.client?.env)
  const decider = createGradeDecider({ ...options, config })
  const chat = createGradeCaller({ ...options, config })
  if (!decider || !chat) return null
  return {
    decide: decider.decide,
    decisionModel: decider.model,
    caller: chat.caller,
    chatModel: chat.model,
    confidenceFloor: config.confidenceFloor,
  }
}
