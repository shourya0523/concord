/**
 * Jev-verified cascade for generative text (docs/vendor/jev/jev-verified-cascade.md):
 * the SMALL chat model drafts, ONE Jev `choice` checks the draft against the
 * sources it was allowed to use, and the caller ships the draft only when the
 * verdict is `supported` at or above JEV_ACCEPT_CONFIDENCE (default 0.8).
 * Concord has no frontier tier: a rejected draft falls back to the caller's
 * deterministic cite-only text.
 */
import { decide, type ChoiceQuestion } from "./decisions.js"
import { jevAcceptConfidence } from "./models.js"
import type { ClientOptions } from "./openrouter.js"

export type DraftVerdict = "supported" | "unsupported" | "declined"

export const DRAFT_SUPPORT_QUESTION: ChoiceQuestion<DraftVerdict> = {
  type: "choice",
  instructions: "Compare the draft against the sources and the request. Which one describes the draft?",
  criteria: {
    supported:
      "The draft addresses the request, and every fact, number, score, and recommendation in it is stated in or directly follows from the sources.",
    unsupported:
      "The draft states at least one fact, number, score, or claim that the sources do not contain or that contradicts them, or it answers a different request.",
    declined: "The draft says the sources do not cover the request and does not assert facts of its own.",
  },
}

export type DraftVerification = {
  verdict: DraftVerdict
  /** 0–1 (0 when Jev omitted it). */
  confidence: number
  probabilities: Record<string, number>
  /** supported ∧ confidence ≥ threshold. */
  accepted: boolean
  threshold: number
  model: string
  cost: number | null
}

export function acceptDraft(verdict: DraftVerdict, confidence: number, threshold: number): boolean {
  return verdict === "supported" && confidence >= threshold
}

/** One Decisions request: is `draft` supported by `sources` for `request`? */
export async function verifyDraft(
  input: { sources: unknown[]; request: string; draft: string },
  options: { acceptConfidence?: number; model?: string; signal?: AbortSignal } = {},
  client: ClientOptions = {},
): Promise<DraftVerification> {
  const threshold = options.acceptConfidence ?? jevAcceptConfidence(client.env ?? process.env)
  const result = await decide(
    {
      state: { sources: input.sources, request: input.request, draft: input.draft },
      questions: { support: DRAFT_SUPPORT_QUESTION },
      model: options.model,
      signal: options.signal,
    },
    client,
  )
  const answer = result.answers.support
  return {
    verdict: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    accepted: acceptDraft(answer.choice, answer.confidence, threshold),
    threshold,
    model: result.model,
    cost: result.usage.cost,
  }
}
