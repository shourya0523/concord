/**
 * Cited Gemini coaching paragraph for the simulator after-action report
 * (plan 2026-09-23-001 P5.8). Cite-only: the model sees stage scores, topic
 * labels, teaching answer ids and heat topic ids + intensities — never any
 * Glassdoor text — and every sentence must carry a bracket citation from the
 * allowed list. Anything else is rejected and the deterministic summary stays.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { DEFAULT_RAG_GENERATE_MODEL, googleApiKey } from "@ibpe/ai"
import { generateText } from "ai"

import type { MockReport, ReportCitation } from "./report"

export const COACH_TIMEOUT_MS = 8_000

export type CoachGenerate = (input: {
  apiKey: string
  modelId: string
  system: string
  prompt: string
  abortSignal: AbortSignal
}) => Promise<string>

const defaultGenerate: CoachGenerate = async ({ apiKey, modelId, system, prompt, abortSignal }) => {
  const google = createGoogleGenerativeAI({ apiKey })
  const { text } = await generateText({
    model: google(modelId),
    temperature: 0.2,
    maxOutputTokens: 260,
    abortSignal,
    system,
    prompt,
  })
  return text
}

export const COACH_SYSTEM =
  "You are a concise IB/PE interview coach writing an after-action note for a mock interview. Use only the facts provided. Every sentence must end with at least one exact bracket citation like [id] chosen from ALLOWED_CITATIONS. Teaching answer ids are the only source of correct content. heat:* ids are firm interview-frequency signals: cite them only to explain priority, never as answer content, and never quote or paraphrase interview reports. Do not use quotation marks. No firm-specific claims beyond topic frequency."

export function buildCoachPrompt(report: MockReport, allowed: ReportCitation[], firmName?: string | null): string {
  const stageLines = report.stages
    .map((stage) => {
      const score = stage.score == null ? "not graded" : `${Math.round(stage.score * 100)}%`
      const teaching = stage.question_id ? `question ${stage.question_id}` : "no question"
      return `- ${stage.label} (topic ${stage.topic ?? "general"}): ${score}; ${teaching}`
    })
    .join("\n")
  const allowedLines = allowed
    .map((citation) => `- ${citation.id} (${citation.kind}${citation.label ? `: ${citation.label}` : ""})`)
    .join("\n")
  return `Mock interview${firmName ? ` for ${firmName}` : ""}. Overall ${
    report.overall_score == null ? "not graded" : `${Math.round(report.overall_score * 100)}%`
  }.
STAGES:
${stageLines}
STRONGEST TOPICS: ${report.strongest_topics.map((t) => `${t.label} ${Math.round(t.score * 100)}%`).join(", ") || "none"}
WEAKEST TOPICS: ${report.weakest_topics.map((t) => `${t.label} ${Math.round(t.score * 100)}%`).join(", ") || "none"}
RECOMMENDED CONCEPT LABS: ${report.recommended_concepts.map((c) => c.title).join(", ") || "none"}

ALLOWED_CITATIONS:
${allowedLines}

Write 2-4 short sentences of coaching: what went well, the single highest-priority fix, and what to practise next. Cite every sentence.`
}

/**
 * Accept the paragraph only when every sentence cites an allowed id, no
 * unknown id is cited, and nothing looks like a quotation.
 */
export function validateCoaching(
  text: string,
  allowedIds: ReadonlySet<string>,
): { text: string; citation_ids: string[] } | null {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (!trimmed || trimmed.length > 900) return null
  if (/["“”]/.test(trimmed)) return null
  const sentences = trimmed.match(/[^.!?]+(?:[.!?]+(?:\s*\[[^\]]+\])*|$)/g) ?? []
  if (sentences.length === 0 || sentences.length > 6) return null
  const cited = new Set<string>()
  for (const sentence of sentences) {
    const ids = [...sentence.matchAll(/\[([^\]]+)\]/g)].flatMap((match) =>
      match[1]!.split(/[,;]\s*/).map((id) => id.trim()),
    )
    if (ids.length === 0) return null
    for (const id of ids) {
      if (!allowedIds.has(id)) return null
      cited.add(id)
    }
  }
  return { text: trimmed, citation_ids: [...cited] }
}

export async function generateCoaching(
  input: { report: MockReport; allowed: ReportCitation[]; firmName?: string | null },
  deps: { env?: NodeJS.ProcessEnv; generate?: CoachGenerate; timeoutMs?: number } = {},
): Promise<{ text: string; citation_ids: string[]; model: string } | null> {
  const env = deps.env ?? process.env
  const apiKey = googleApiKey(env)
  if (!apiKey || input.allowed.length === 0 || input.report.graded_stages === 0) return null
  const modelId = env.GRADER_MODEL?.trim() || DEFAULT_RAG_GENERATE_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? COACH_TIMEOUT_MS)
  try {
    const text = await (deps.generate ?? defaultGenerate)({
      apiKey,
      modelId,
      system: COACH_SYSTEM,
      prompt: buildCoachPrompt(input.report, input.allowed, input.firmName),
      abortSignal: controller.signal,
    })
    const validated = validateCoaching(text, new Set(input.allowed.map((c) => c.id)))
    return validated ? { ...validated, model: modelId } : null
  } catch (err) {
    console.warn("[simulator-coach] Gemini coaching failed; keeping deterministic summary", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
