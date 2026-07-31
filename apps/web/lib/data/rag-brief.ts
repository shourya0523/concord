import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { DEFAULT_RAG_GENERATE_MODEL, googleApiKey } from "@ibpe/ai"
import { generateText } from "ai"

type BriefSource = "gemini" | "template"

export type RagBriefCitation = {
  item_id: string
  label: string
}

export type RagBriefItem = {
  id: string
  title: string
  snippet?: string | null
}

export type RagBriefInput = {
  query: string
  firm_names?: string[]
  weak_topics?: string[]
  items: RagBriefItem[]
}

export type RagBriefResult = {
  brief: string
  brief_source: BriefSource
  brief_citations: RagBriefCitation[]
  note?: string
}

type RewriteResult = Omit<RagBriefResult, "brief_source"> & {
  brief_source: "gemini"
}

const MAX_ITEMS_FOR_PROMPT = 8

function citationFor(item: RagBriefItem): RagBriefCitation {
  return {
    item_id: item.id,
    label: item.title.slice(0, 120),
  }
}

function citationLabel(item: RagBriefItem): string {
  return `[${item.id}]`
}

function extractCitationIds(text: string): string[] {
  const ids: string[] = []
  const citationPattern = /\[([^\]\[\s]+)\]/g
  for (const match of text.matchAll(citationPattern)) {
    const id = match[1]
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function splitClaims(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((claim) => claim.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
}

export function validateCitedBrief(
  raw: string,
  items: RagBriefItem[]
): { brief: string; citation_ids: string[] } | null {
  const allowed = new Set(items.map((item) => item.id))
  const kept: string[] = []

  for (const claim of splitClaims(raw)) {
    const ids = extractCitationIds(claim)
    if (ids.length === 0) continue
    if (ids.some((id) => !allowed.has(id))) continue
    kept.push(claim)
  }

  const brief = kept.join(" ").replace(/\s+/g, " ").trim()
  const citation_ids = extractCitationIds(brief).filter((id) => allowed.has(id))
  if (brief.length < 40 || citation_ids.length === 0) return null
  return { brief, citation_ids }
}

export function buildTemplateRagBrief(input: RagBriefInput): RagBriefResult {
  const items = input.items.slice(0, 3)
  if (items.length === 0) {
    return {
      brief:
        "No cited teaching-corpus items were retrieved for this pack; broaden the focus prompt or target firms before starting the study loop.",
      brief_source: "template",
      brief_citations: [],
      note: "Template brief used because the pack returned no cited items.",
    }
  }

  const firmText =
    input.firm_names && input.firm_names.length > 0
      ? ` for ${input.firm_names.join(" + ")}`
      : ""
  const weakText =
    input.weak_topics && input.weak_topics.length > 0
      ? ` Prioritize weak topics: ${input.weak_topics.slice(0, 4).join(", ")} ${citationLabel(items[0]!)}.`
      : ""
  const itemText = items
    .map(
      (item, index) =>
        `${index === 0 ? "Start" : "Then"} with ${item.title} ${citationLabel(item)}`
    )
    .join(" ")

  return {
    brief:
      `${itemText} Use the cited teaching corpus as the answer source${firmText}; Glassdoor-derived signals only affect retrieval ranking ${citationLabel(items[0]!)}.${weakText}`.trim(),
    brief_source: "template",
    brief_citations: items.map(citationFor),
    note: "Template brief used; Gemini rewrite unavailable or rejected by citation guard.",
  }
}

export async function tryGenerateGroundedRagBrief(
  input: RagBriefInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<RewriteResult | null> {
  const apiKey = googleApiKey(env)
  const items = input.items.slice(0, MAX_ITEMS_FOR_PROMPT)
  if (!apiKey || items.length === 0) return null

  const google = createGoogleGenerativeAI({ apiKey })
  const firmText =
    input.firm_names && input.firm_names.length > 0
      ? input.firm_names.join(", ")
      : "selected target firms"
  const weakText =
    input.weak_topics && input.weak_topics.length > 0
      ? input.weak_topics.join(", ")
      : "none supplied"
  const packItems = items
    .map(
      (item) =>
        `ID: ${item.id}\nTitle: ${item.title}\nSnippet: ${item.snippet?.slice(0, 360) ?? ""}`
    )
    .join("\n\n")

  try {
    const { text } = await generateText({
      model: google(DEFAULT_RAG_GENERATE_MODEL),
      temperature: 0.2,
      maxOutputTokens: 220,
      instructions:
        "Rewrite an IB/PE interview-prep session brief using only the provided pack items. Every sentence must include at least one exact bracket citation like [item_id]. Do not make uncited firm-specific, market, Glassdoor, or web claims. Glassdoor signals are retrieval signals only, never answer evidence.",
      prompt: `User focus prompt: ${input.query}
Target firms used for retrieval context only: ${firmText}
Weak topics: ${weakText}

PACK_ITEMS:
${packItems}

Return 2-4 concise sentences. Use exact bracket citations from PACK_ITEMS in every sentence.`,
    })

    const validated = validateCitedBrief(text, items)
    if (!validated) return null
    const citationMap = new Map(
      items.map((item) => [item.id, citationFor(item)])
    )
    return {
      brief: validated.brief,
      brief_source: "gemini",
      brief_citations: validated.citation_ids
        .map((id) => citationMap.get(id))
        .filter((citation): citation is RagBriefCitation => Boolean(citation)),
      note: `Gemini brief rewrite accepted with ${validated.citation_ids.length} cited pack item(s).`,
    }
  } catch (err) {
    console.warn("[rag-brief] Gemini rewrite failed; using template", err)
    return null
  }
}

export async function buildRagBrief(
  input: RagBriefInput
): Promise<RagBriefResult> {
  const rewritten = await tryGenerateGroundedRagBrief(input)
  return rewritten ?? buildTemplateRagBrief(input)
}
