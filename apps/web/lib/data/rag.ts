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

/**
 * Last-resort lexical corpus: published teaching Q/A (not embedded docs).
 * Only used when the embedding index is unavailable/empty.
 */
async function loadPublishedTeachingDocuments(limit = 250): Promise<TeachingDocument[]> {
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
      LIMIT ${limit}
    `) as Array<{
      id: string;
      canonical_wording: string;
      topic: string | null;
      domain: string | null;
      difficulty: string | null;
      concise_answer: string;
      expanded_explanation: string;
      provenance_type: string;
    }>;
    return rows
      .filter((row) => row.provenance_type !== "glassdoor_occurrence")
      .map((row) => ({
        id: row.id,
        title: row.canonical_wording,
        body: `${row.concise_answer}\n\n${row.expanded_explanation}`,
        topic: row.topic,
        domain: row.domain,
        difficulty: row.difficulty,
        provenance: mapProvenance(row.provenance_type),
        concept_ids: row.topic ? [row.topic] : [],
        firm_ids: [],
        source_label: "published_corpus",
      }));
  } catch (err) {
    console.warn("[rag] published teaching read failed", err);
    return [];
  }
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

  // Lexical fallback over embedded docs, else the published corpus itself
  const embedded = await loadEmbeddedDocuments({ limit: 500 });
  const docs: TeachingDocument[] =
    embedded.length > 0 ? embedded : await loadPublishedTeachingDocuments(500);
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

  const embedded = await loadEmbeddedDocuments({ limit: 250 });
  const docs =
    embedded.length > 0 ? embedded : await loadPublishedTeachingDocuments(250);
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
