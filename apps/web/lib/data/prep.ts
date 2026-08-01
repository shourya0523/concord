import { buildPseudoRagPack, buildTopicHeat } from "@ibpe/search"
import type { TopicHeat } from "@ibpe/contracts"
import type {
  HeatFirmMetaSchema,
  MultiFirmHeatResponse,
  PrepRagRequest,
  PrepRagResponse,
} from "@/lib/api/schemas"
import { z } from "zod"
import { isDatabaseConfigured } from "@/lib/db/client"
import { listFirmCatalog } from "./catalog"
import { loadBankQuestions } from "./bank-fallback"
import { getFirmTopicHeat } from "./firms"
import { buildRealPrepRagPack } from "./rag"
import { buildRagBrief } from "./rag-brief"

function aggregateHeat(
  rows: TopicHeat[],
  firmIds: string[],
  firms: z.infer<typeof HeatFirmMetaSchema>[]
): MultiFirmHeatResponse {
  const by_topic: Record<string, number> = {}
  for (const row of rows) {
    if (!firmIds.includes(row.firm_id)) continue
    by_topic[row.topic_id] = Math.max(
      by_topic[row.topic_id] ?? 0,
      row.intensity
    )
  }
  return {
    firm_ids: firmIds,
    firms,
    topics: rows,
    by_topic,
    source: rows.length ? "published" : "empty",
  }
}

async function firmMetaFor(
  firmIds: string[]
): Promise<z.infer<typeof HeatFirmMetaSchema>[]> {
  const catalog = await listFirmCatalog()
  const byKey = new Map(
    catalog.items.flatMap(
      (firm) =>
        [
          [firm.id, firm],
          [firm.slug, firm],
        ] as const
    )
  )
  return firmIds.map((id) => {
    const firm = byKey.get(id)
    return {
      id: firm?.id ?? id,
      slug: firm?.slug ?? id.replace(/^firm_/, ""),
      name: firm?.name ?? id.replace(/^firm_/, "").replace(/-/g, " "),
    }
  })
}

export async function getMultiFirmHeat(
  firmIds: string[]
): Promise<MultiFirmHeatResponse> {
  const uniqueFirmIds = [...new Set(firmIds.filter(Boolean))]
  if (uniqueFirmIds.length === 0) {
    return {
      firm_ids: [],
      firms: [],
      topics: [],
      by_topic: {},
      source: "empty",
      note: "No firm_id query parameters supplied.",
    }
  }
  const firms = await firmMetaFor(uniqueFirmIds)
  const canonicalIds = firms.map((firm) => firm.id)

  async function fallbackHeat(note: string): Promise<MultiFirmHeatResponse> {
    try {
      const bankRows = (await loadBankQuestions()).map((row) => ({
        id: row.id,
        company: row.company,
        track: String(row.track),
        position: row.position,
        question: row.question,
        date_posted: row.date_posted,
        scraped_at: row.scraped_at,
      }))
      const heat = buildTopicHeat(bankRows, { firm_ids: canonicalIds })
      return {
        firm_ids: canonicalIds,
        firms,
        topics: heat.rows,
        by_topic: heat.by_topic,
        source: heat.rows.length ? "bank_fallback" : "empty",
        note,
      }
    } catch (err) {
      console.warn("[prep] bank heat failed; returning empty heat", err)
      return {
        firm_ids: canonicalIds,
        firms,
        topics: [],
        by_topic: {},
        source: "empty",
        note: "No heat available.",
      }
    }
  }

  if (!isDatabaseConfigured()) {
    return fallbackHeat(
      "DATABASE_URL unset — heat computed from local question bank."
    )
  }

  const responses = await Promise.all(canonicalIds.map(getFirmTopicHeat))
  const rows = responses.flatMap((response) => response.topics)
  if (rows.length === 0) {
    return fallbackHeat(
      "Published heat empty for firm set — using local bank heat."
    )
  }
  const aggregated = aggregateHeat(rows, canonicalIds, firms)
  return {
    ...aggregated,
    source: responses.some((response) => response.source === "published")
      ? "published"
      : aggregated.source,
    note: responses
      .map((response) => response.note)
      .filter((note): note is string => Boolean(note))
      .join(" "),
  }
}

export async function buildPrepRagPack(
  input: PrepRagRequest
): Promise<PrepRagResponse> {
  const query =
    input.query?.trim() ||
    `Prepare me for ${input.firm_ids.join(", ")} technical interviews`
  const heatResponse = await getMultiFirmHeat(input.firm_ids)

  const real = await buildRealPrepRagPack({
    query,
    firm_ids: input.firm_ids,
    weak_topics: input.weak_topics,
    limit: input.limit,
    heat: heatResponse.topics,
  })
  const brief = await buildRagBrief({
    query,
    firm_names: heatResponse.firms.map((firm) => firm.name),
    weak_topics: input.weak_topics,
    items: real.hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      snippet: hit.snippet,
    })),
  })

  return {
    pack: real.pack,
    explanations: real.explanations,
    hits: real.hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      snippet: hit.snippet,
      score: hit.score,
      provenance: hit.provenance,
      firm_ids: hit.firm_ids,
      concept_ids: hit.concept_ids,
      metadata: hit.metadata,
    })),
    source: real.source,
    brief: brief.brief,
    brief_source: brief.brief_source,
    brief_citations: brief.brief_citations,
    notes: [
      ...real.notes,
      brief.note,
      heatResponse.note,
      `RAG backend: ${real.backend}`,
    ].filter((note): note is string => Boolean(note)),
  }
}
