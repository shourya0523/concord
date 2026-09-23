/**
 * Cited AI coaching paragraph for the simulator after-action report (plan
 * 2026-09-23-001 P5.8) — a Jev-verified cascade
 * (docs/vendor/jev/jev-verified-cascade.md):
 *
 *   1. the SMALL chat model (LLM_SMALL_MODEL) drafts. Cite-only: it sees stage
 *      scores, topic labels, teaching answer ids and heat topic ids +
 *      intensities — never any Glassdoor text
 *   2. `validateCoaching`: every sentence cites an allowed id, no quotes
 *   3. ONE Jev choice (supported | unsupported | declined) checks the draft
 *      against those facts
 *   4. shipped only when supported at ≥ JEV_ACCEPT_CONFIDENCE (0.8); anything
 *      else keeps the deterministic summary (no frontier escalation)
 */
import { chat, isLlmConfigured, smallModel, verifyDraft } from "@ibpe/ai"

import type { MockReport, ReportCitation } from "./report"

export const COACH_TIMEOUT_MS = 8_000

export type CoachGenerate = (input: {
  env: NodeJS.ProcessEnv
  modelId: string
  system: string
  prompt: string
  abortSignal: AbortSignal
}) => Promise<string>

const defaultGenerate: CoachGenerate = async ({ env, modelId, system, prompt, abortSignal }) => {
  const { text } = await chat(
    {
      model: modelId,
      temperature: 0.2,
      maxTokens: 260,
      signal: abortSignal,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
    { env },
  )
  return text
}

/** Injected Jev verification (default: `verifyDraft` from @ibpe/ai). */
export type CoachVerify = (input: {
  env: NodeJS.ProcessEnv
  sources: string[]
  request: string
  draft: string
  abortSignal: AbortSignal
}) => Promise<{ accepted: boolean; verdict: string; confidence: number }>

const defaultVerify: CoachVerify = ({ env, sources, request, draft, abortSignal }) =>
  verifyDraft({ sources, request, draft }, { signal: abortSignal }, { env })

export const COACH_REQUEST =
  "After-action coaching note for this mock interview: what went well, the single highest-priority fix, and what to practise next, citing only the allowed ids."

/** The facts the coaching draft may use (Jev verifies the draft against these). */
export function coachSources(
  report: MockReport,
  allowed: ReportCitation[],
  firmName?: string | null,
): string[] {
  const pct = (score: number | null | undefined) => (score == null ? "not graded" : `${Math.round(score * 100)}%`)
  return [
    `Mock interview${firmName ? ` for ${firmName}` : ""}: overall ${pct(report.overall_score)}.`,
    ...report.stages.map(
      (stage) => `Stage ${stage.label} (topic ${stage.topic ?? "general"}): ${pct(stage.score)}.`,
    ),
    `Strongest topics: ${report.strongest_topics.map((t) => `${t.label} ${pct(t.score)}`).join(", ") || "none"}.`,
    `Weakest topics: ${report.weakest_topics.map((t) => `${t.label} ${pct(t.score)}`).join(", ") || "none"}.`,
    `Recommended concept labs: ${report.recommended_concepts.map((c) => c.title).join(", ") || "none"}.`,
    ...allowed.map(
      (citation) =>
        `[${citation.id}] ${citation.kind === "heat_topic" ? "firm interview-frequency signal" : "teaching answer"}${
          citation.label ? `: ${citation.label}` : ""
        }`,
    ),
  ]
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
  deps: { env?: NodeJS.ProcessEnv; generate?: CoachGenerate; verify?: CoachVerify; timeoutMs?: number } = {},
): Promise<{ text: string; citation_ids: string[]; model: string; verified: true } | null> {
  const env = deps.env ?? process.env
  if (!isLlmConfigured(env) || input.allowed.length === 0 || input.report.graded_stages === 0) return null
  const modelId = smallModel(env)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? COACH_TIMEOUT_MS)
  try {
    const text = await (deps.generate ?? defaultGenerate)({
      env,
      modelId,
      system: COACH_SYSTEM,
      prompt: buildCoachPrompt(input.report, input.allowed, input.firmName),
      abortSignal: controller.signal,
    })
    const validated = validateCoaching(text, new Set(input.allowed.map((c) => c.id)))
    if (!validated) return null
    const verification = await (deps.verify ?? defaultVerify)({
      env,
      sources: coachSources(input.report, input.allowed, input.firmName),
      request: COACH_REQUEST,
      draft: validated.text,
      abortSignal: controller.signal,
    })
    if (!verification.accepted) {
      console.info(
        `[simulator-coach] Jev rejected coaching draft (${verification.verdict} @ ${verification.confidence}); keeping deterministic summary`,
      )
      return null
    }
    return { ...validated, model: modelId, verified: true }
  } catch (err) {
    console.warn("[simulator-coach] AI coaching or Jev verification failed; keeping deterministic summary", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
