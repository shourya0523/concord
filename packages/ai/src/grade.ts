/**
 * Grader model selection (plan 2026-09-23-001 P0.5 / P3.7, decision log
 * "Grader = Jev decisions + small-LLM escalation").
 *
 * The grader asks Jev (decision tier, `LLM_DECISION_MODEL`) one typed
 * question per rubric key point / red flag; only low-confidence or failed
 * decisions escalate to the SMALL chat model (`LLM_SMALL_MODEL`) running the
 * rubric-judge prompt. Legacy `GRADER_MODEL` overrides the decision model only
 * when it names a Jev release (see ./models.ts).
 */
import {
  DEFAULT_DECISION_MODEL,
  decisionModel,
  isLlmConfigured,
  jevConfidenceFloor,
  smallModel,
} from "./models.js"

export const DEFAULT_GRADE_MODEL = DEFAULT_DECISION_MODEL

export type GradeModelConfig = {
  /** Jev model for the typed grade decisions. */
  decisionModel: string
  /** Small chat model used only on escalation. */
  chatModel: string
  /** Escalate when a must-have key point's Jev confidence is below this. */
  confidenceFloor: number
  route: "openrouter"
  /** True when OPENROUTER_API_KEY is present. */
  available: boolean
}

export function gradeModelId(env: NodeJS.ProcessEnv = process.env): string {
  return decisionModel(env)
}

export function gradeModelConfig(env: NodeJS.ProcessEnv = process.env): GradeModelConfig {
  return {
    decisionModel: decisionModel(env),
    chatModel: smallModel(env),
    confidenceFloor: jevConfidenceFloor(env),
    route: "openrouter",
    available: isLlmConfigured(env),
  }
}
