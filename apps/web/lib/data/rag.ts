/**
 * Real RAG data access — pgvector retrieve + pack build + search.
 * Falls back to lexical @ibpe/search when embeddings/API unavailable.
 */
import {
  buildPseudoRagPack,
  buildRealRagPack,
  searchCorpus,
  type EmbeddedDocument,
  type TeachingDocument,
} from "@ibpe/search";
import {
  embedText,
  isEmbeddingConfigured,
  toPgVectorLiteral,
} from "@ibpe/ai";
import type { TopicHeat } from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  CONCEPTS,
  RESOURCES,
} from "@/lib/mock-data";

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

type RagRow = {
  id: string;
  title: string;
  body: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  provenance: string;
  embedding: string | number[] | null;
};

function parseEmbedding(raw: string | number[] | null): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(Number);
  const s = String(raw).trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return null;
}

function mapProvenance(p: string): TeachingDocument["provenance"] {
  if (
    p === "github_source" ||
    p === "static_seed" ||
    p === "editorial" ||
    p === "gemini_synthesised"
  ) {
    return p;
  }
  return "github_source";
}

/** Load embedded teaching docs from Neon (optional topic/limit). */
export async function loadEmbeddedDocuments(opts?: {
  limit?: number;
}): Promise<EmbeddedDocument[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const sql = requireSql();
    const limit = opts?.limit ?? 500;
    const rows = (await sql`
      SELECT id, title, body, topic, domain, difficulty, provenance, embedding::text AS embedding
      FROM canonical.rag_documents
      WHERE embedding IS NOT NULL
        AND provenance <> 'glassdoor_occurrence'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${limit}
    `) as RagRow[];

    const out: EmbeddedDocument[] = [];
    for (const row of rows) {
      const embedding = parseEmbedding(row.embedding);
      if (!embedding?.length) continue;
      out.push({
        id: row.id,
        title: row.title,
        body: row.body,
        topic: row.topic,
        domain: row.domain,
        difficulty: row.difficulty,
        provenance: mapProvenance(row.provenance),
        concept_ids: row.topic ? [row.topic] : [],
        firm_ids: [],
        source_label: "rag_documents",
        embedding,
      });
    }
    return out;
  } catch (err) {
    console.warn("[rag] loadEmbeddedDocuments failed", err);
    return [];
  }
}

/** Neon ANN retrieve by query vector (cosine distance). */
export async function vectorSearch(
  queryEmbedding: number[],
  opts?: { limit?: number },
): Promise<EmbeddedDocument[]> {
  if (!isDatabaseConfigured()) return [];
  const limit = opts?.limit ?? 40;
  try {
    const sql = requireSql();
    const literal = toPgVectorLiteral(queryEmbedding);
    const rows = (await sql`
      SELECT
        id, title, body, topic, domain, difficulty, provenance,
        embedding::text AS embedding,
        1 - (embedding <=> ${literal}::vector) AS score
      FROM canonical.rag_documents
      WHERE embedding IS NOT NULL
        AND provenance <> 'glassdoor_occurrence'
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit}
    `) as Array<RagRow & { score: number }>;

    return rows
      .map((row) => {
        const embedding = parseEmbedding(row.embedding) ?? queryEmbedding;
        return {
          id: row.id,
          title: row.title,
          body: row.body,
          topic: row.topic,
          domain: row.domain,
          difficulty: row.difficulty,
          provenance: mapProvenance(row.provenance),
          concept_ids: row.topic ? [row.topic] : [],
          firm_ids: [],
          source_label: "pgvector",
          embedding,
        } satisfies EmbeddedDocument;
      });
  } catch (err) {
    console.warn("[rag] vectorSearch failed; caller should fall back", err);
    return [];
  }
}

export async function hybridSearch(opts: {
  q: string;
  firm_ids?: string[];
  tracks?: string[];
  limit?: number;
  offset?: number;
  heat?: TopicHeat[];
  weak_topics?: string[];
}) {
  const started = Date.now();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  if (isEmbeddingConfigured() && isDatabaseConfigured() && opts.q.trim()) {
    try {
      const queryEmbedding = await embedText(opts.q);
      const docs = await vectorSearch(queryEmbedding, { limit: 80 });
      if (docs.length) {
        const result = searchCorpus({
          request: {
            q: opts.q,
            firm_ids: opts.firm_ids ?? [],
            tracks: opts.tracks ?? [],
            limit,
            offset,
          },
          documents: docs,
          heat: opts.heat ?? [],
          weak_topics: opts.weak_topics ?? [],
          weights: {
            text: 0.2,
            trigram: 0.08,
            lexical_vector: 0.12,
            heat: 0.2,
            weakness: 0.15,
            provenance_quality: 0.05,
          },
        });
        // Re-blend with dense scores from ANN order
        const denseRank = new Map(docs.map((d, i) => [d.id, 1 - i / docs.length]));
        const hits = result.hits.map((h) => ({
          ...h,
          score: Number(
            (
              0.55 * (denseRank.get(h.id) ?? 0) +
              0.45 * h.score
            ).toFixed(6),
          ),
          metadata: {
            ...h.metadata,
            backend: "real_rag_embeddings",
          },
        }));
        hits.sort((a, b) => b.score - a.score);
        return {
          query: result.query,
          hits,
          total: result.total,
          next_cursor: result.next_cursor,
          took_ms: Date.now() - started,
          backend: "real_rag_embeddings" as const,
        };
      }
    } catch (err) {
      console.warn("[rag] hybridSearch dense path failed", err);
    }
  }

  // Lexical fallback over static + any embedded titles without vectors
  const embedded = await loadEmbeddedDocuments({ limit: 500 });
  const docs: TeachingDocument[] =
    embedded.length > 0 ? embedded : staticTeachingDocuments();
  const result = searchCorpus({
    request: {
      q: opts.q,
      firm_ids: opts.firm_ids ?? [],
      tracks: opts.tracks ?? [],
      limit,
      offset,
    },
    documents: docs,
    heat: opts.heat ?? [],
    weak_topics: opts.weak_topics ?? [],
  });
  return {
    ...result,
    took_ms: Date.now() - started,
    backend: "in_memory_hybrid" as const,
  };
}

export async function buildRealPrepRagPack(input: {
  query: string;
  firm_ids: string[];
  weak_topics?: string[];
  limit?: number;
  heat: TopicHeat[];
}): Promise<{
  pack: ReturnType<typeof buildRealRagPack>["pack"];
  explanations: ReturnType<typeof buildRealRagPack>["metadata"]["explanations"];
  hits: ReturnType<typeof buildRealRagPack>["hits"];
  notes: string[];
  source: "published" | "stub";
  backend: "real_rag_embeddings" | "in_memory_hybrid";
}> {
  const weak = input.weak_topics ?? [];
  const limit = input.limit ?? 8;

  if (isEmbeddingConfigured() && isDatabaseConfigured()) {
    try {
      const queryEmbedding = await embedText(input.query);
      let embedded = await vectorSearch(queryEmbedding, { limit: 60 });
      if (embedded.length === 0) {
        embedded = await loadEmbeddedDocuments({ limit: 250 });
      }
      if (embedded.length > 0) {
        const result = buildRealRagPack({
          query: input.query,
          firm_ids: input.firm_ids,
          weak_topics: weak,
          limit,
          documents: embedded,
          embeddedDocuments: embedded,
          heat: input.heat,
          queryEmbedding,
        });
        return {
          pack: result.pack,
          explanations: result.metadata.explanations,
          hits: result.hits,
          notes: result.metadata.notes,
          source: "published",
          backend: "real_rag_embeddings",
        };
      }
    } catch (err) {
      console.warn("[rag] real pack failed; falling back to lexical", err);
    }
  }

  const docs = [
    ...(await loadEmbeddedDocuments({ limit: 250 })),
    ...staticTeachingDocuments(),
  ];
  const result = buildPseudoRagPack({
    query: input.query,
    firm_ids: input.firm_ids,
    weak_topics: weak,
    limit,
    documents: docs,
    heat: input.heat,
  });
  return {
    pack: result.pack,
    explanations: result.metadata.explanations,
    hits: result.hits,
    notes: [
      ...result.metadata.notes,
      "Fell back to lexical pseudo-RAG (embeddings unavailable or empty index).",
    ],
    source: docs.some((d) => d.source_label === "rag_documents")
      ? "published"
      : "stub",
    backend: "in_memory_hybrid",
  };
}
