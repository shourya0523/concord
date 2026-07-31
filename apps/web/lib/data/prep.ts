import {
  buildPseudoRagPack,
  buildTopicHeat,
  type TeachingDocument,
} from "@ibpe/search";
import type { TopicHeat } from "@ibpe/contracts";
import type {
  MultiFirmHeatResponse,
  PrepRagRequest,
  PrepRagResponse,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  CONCEPTS,
  RESOURCES,
  TOPIC_HEAT,
} from "@/lib/mock-data";
import { loadBankQuestions } from "./bank-fallback";
import { getFirmTopicHeat } from "./firms";
import { buildRealPrepRagPack } from "./rag";

function staticTeachingDocuments(): TeachingDocument[] {
  const conceptDocs: TeachingDocument[] = CONCEPTS.map((concept) => ({
    id: concept.id,
    title: concept.title,
    body: concept.summary ?? concept.title,
    topic: concept.id.replace(/^concept_/, "topic_"),
    domain: concept.domain ?? "both",
    difficulty: null,
    provenance: "static_seed",
    concept_ids: [concept.id],
    firm_ids: Object.keys(concept.firm_relevance),
    source_label: "Static concept seed",
  }));

  const resourceDocs: TeachingDocument[] = RESOURCES.map((resource) => ({
    id: resource.id,
    title: resource.label,
    body: `${resource.label}. ${resource.url}`,
    topic: null,
    domain: null,
    difficulty: null,
    provenance: resource.provenance,
    concept_ids: resource.concept_ids,
    firm_ids: resource.firm_ids,
    source_label: "Curated resource",
  }));

  return [...conceptDocs, ...resourceDocs];
}

type PublishedTeachingRow = {
  id: string;
  canonical_wording: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  concise_answer: string;
  expanded_explanation: string;
  provenance_type: string;
};

async function loadPublishedTeachingDocuments(): Promise<TeachingDocument[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT
        q.id,
        q.canonical_wording,
        q.topic,
        q.domain,
        q.difficulty,
        a.concise_answer,
        a.expanded_explanation,
        a.provenance_type
      FROM published.v_questions q
      JOIN published.v_answers a ON a.canonical_question_id = q.id
      ORDER BY q.updated_at DESC NULLS LAST
      LIMIT 250
    `) as PublishedTeachingRow[];
    return rows
      .filter((row) => row.provenance_type !== "glassdoor_occurrence")
      .map((row) => ({
        id: row.id,
        title: row.canonical_wording,
        body: `${row.concise_answer}\n\n${row.expanded_explanation}`,
        topic: row.topic,
        domain: row.domain,
        difficulty: row.difficulty,
        provenance:
          row.provenance_type === "source_provided" ||
          row.provenance_type === "corpus_matched"
            ? "github_source"
            : "editorial",
        concept_ids: row.topic ? [row.topic] : [],
        firm_ids: [],
        source_label: "Published answer corpus",
      }));
  } catch (err) {
    console.warn("[prep] published teaching doc read failed", err);
    return [];
  }
}

function aggregateHeat(rows: TopicHeat[], firmIds: string[]): MultiFirmHeatResponse {
  const by_topic: Record<string, number> = {};
  for (const row of rows) {
    if (!firmIds.includes(row.firm_id)) continue;
    by_topic[row.topic_id] = Math.max(by_topic[row.topic_id] ?? 0, row.intensity);
  }
  return {
    firm_ids: firmIds,
    topics: rows,
    by_topic,
    source: rows.length ? "published" : "empty",
  };
}

export async function getMultiFirmHeat(
  firmIds: string[],
): Promise<MultiFirmHeatResponse> {
  const uniqueFirmIds = [...new Set(firmIds.filter(Boolean))];
  if (uniqueFirmIds.length === 0) {
    return {
      firm_ids: [],
      topics: [],
      by_topic: {},
      source: "empty",
      note: "No firm_id query parameters supplied.",
    };
  }

  async function fallbackHeat(note: string): Promise<MultiFirmHeatResponse> {
    const mockRows = TOPIC_HEAT.filter((row) =>
      uniqueFirmIds.includes(row.firm_id),
    );
    if (mockRows.length) {
      return {
        ...aggregateHeat(mockRows, uniqueFirmIds),
        source: "stub",
        note,
      };
    }

    try {
      const bankRows = (await loadBankQuestions()).map((row) => ({
        id: row.id,
        company: row.company,
        track: String(row.track),
        position: row.position,
        question: row.question,
        date_posted: row.date_posted,
        scraped_at: row.scraped_at,
      }));
      const heat = buildTopicHeat(bankRows, { firm_ids: uniqueFirmIds });
      return {
        firm_ids: uniqueFirmIds,
        topics: heat.rows,
        by_topic: heat.by_topic,
        source: heat.rows.length ? "bank_fallback" : "empty",
        note: "Heat computed from local question_bank signals.",
      };
    } catch (err) {
      console.warn("[prep] bank heat failed; returning empty heat", err);
      return {
        firm_ids: uniqueFirmIds,
        topics: [],
        by_topic: {},
        source: "empty",
        note: "No static or bank heat available.",
      };
    }
  }

  if (!isDatabaseConfigured()) {
    return fallbackHeat("DATABASE_URL unset — using static mock heat.");
  }

  const responses = await Promise.all(uniqueFirmIds.map(getFirmTopicHeat));
  const rows = responses.flatMap((response) => response.topics);
  if (rows.length === 0) {
    return fallbackHeat("Published heat empty for firm set — using fallback heat.");
  }
  const aggregated = aggregateHeat(rows, uniqueFirmIds);
  return {
    ...aggregated,
    source: responses.some((response) => response.source === "published")
      ? "published"
      : aggregated.source,
    note: responses
      .map((response) => response.note)
      .filter((note): note is string => Boolean(note))
      .join(" "),
  };
}

export async function buildPrepRagPack(
  input: PrepRagRequest,
): Promise<PrepRagResponse> {
  const query =
    input.query?.trim() ||
    `Prepare me for ${input.firm_ids.join(", ")} technical interviews`;
  const heatResponse = await getMultiFirmHeat(input.firm_ids);

  const real = await buildRealPrepRagPack({
    query,
    firm_ids: input.firm_ids,
    weak_topics: input.weak_topics,
    limit: input.limit,
    heat: heatResponse.topics,
  });

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
    notes: [
      ...real.notes,
      heatResponse.note,
      `RAG backend: ${real.backend}`,
    ].filter((note): note is string => Boolean(note)),
  };
}
