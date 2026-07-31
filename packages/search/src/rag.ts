/**
 * Real RAG: dense embedding retrieval + heat/weakness hybrid rerank + optional
 * grounded synthesis. Replaces lexical-only "pseudo-RAG" as the default pack path.
 *
 * Glassdoor never enters the answer channel — heat only.
 */
import {
  PseudoRagPackSchema,
  type PseudoRagPack,
  type TopicHeat,
} from "@ibpe/contracts";
import { heatForTopic, topHeatTopics } from "./heat.js";
import { filterByHeatAndWeakness } from "./pack.js";
import { scoreDocument } from "./rank.js";
import type {
  BuildPackInput,
  PackItemExplanation,
  PseudoRagPackMetadata,
  PseudoRagPackResult,
  RankedHit,
  TeachingDocument,
} from "./types.js";

export type EmbeddedDocument = TeachingDocument & {
  embedding: number[];
};

export type RealRagOptions = {
  /** Natural-language query (lexical hybrid component). */
  query: string;
  /** Query embedding (required for dense retrieval). */
  queryEmbedding: number[];
  /** Pre-embedded teaching docs. */
  documents: EmbeddedDocument[];
  heat?: TopicHeat[];
  firm_ids?: string[];
  weak_topics?: string[];
  limit?: number;
  retrieve_k?: number;
  /** Blend weight for dense vs lexical hybrid (0–1). Default 0.55 dense. */
  dense_weight?: number;
};

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function provenanceQuality(p: TeachingDocument["provenance"]): number {
  switch (p) {
    case "github_source":
      return 1;
    case "static_seed":
      return 0.95;
    case "editorial":
      return 0.85;
    case "gemini_synthesised":
      return 0.55;
    default:
      return 0.4;
  }
}

function explainHit(
  hit: RankedHit,
  heat: TopicHeat[],
  firmIds: string[],
  weakTopics: string[],
): PackItemExplanation {
  const topic = hit.topic;
  const { hits: heatHits } = heatForTopic(heat, firmIds, topic);
  const weak_topic_hit = Boolean(topic && weakTopics.includes(topic));
  const reasons: string[] = [];
  const dense = Number(hit.metadata?.dense_score ?? 0);
  if (dense > 0.2) {
    reasons.push(`Dense embedding similarity ${dense.toFixed(3)}`);
  }
  if (weak_topic_hit && topic) {
    reasons.push(`Weak topic match: ${topic}`);
  }
  for (const h of heatHits) {
    reasons.push(
      `Hot for ${h.firm_id} on ${h.topic_id} (intensity ${h.intensity.toFixed(2)}, n=${h.sample_size})`,
    );
  }
  if (hit.provenance === "github_source" || hit.provenance === "static_seed") {
    reasons.push(`Teaching provenance: ${hit.provenance}`);
  }
  if (reasons.length === 0) {
    reasons.push("Included as ranked corpus candidate");
  }
  return {
    item_id: hit.id,
    topic,
    heat_hits: heatHits.map((h) => ({
      firm_id: h.firm_id,
      topic_id: h.topic_id,
      intensity: h.intensity,
    })),
    weak_topic_hit,
    reasons,
  };
}

/** Dense retrieve → hybrid score with lexical + heat + weakness → top-K. */
export function retrieveWithEmbeddings(opts: RealRagOptions): RankedHit[] {
  const heat = opts.heat ?? [];
  const firm_ids = opts.firm_ids ?? [];
  const weak_topics = opts.weak_topics ?? [];
  const denseW = opts.dense_weight ?? 0.55;
  const hybridW = 1 - denseW;
  const retrieve_k = opts.retrieve_k ?? 40;

  const hits: RankedHit[] = [];
  for (const doc of opts.documents) {
    if (doc.provenance === "glassdoor_occurrence") continue;
    const dense = cosine(opts.queryEmbedding, doc.embedding);
    const lexical = scoreDocument(opts.query, doc, {
      heat,
      firm_ids,
      weak_topics,
    });
    const hybrid =
      denseW * Math.max(0, dense) + hybridW * lexical.total;
    const { hits: heatHits } = heatForTopic(heat, firm_ids, doc.topic);
    hits.push({
      id: doc.id,
      kind: "canonical_question",
      title: doc.title,
      snippet: doc.body.slice(0, 220),
      score: hybrid,
      provenance: doc.provenance,
      firm_ids: [
        ...new Set([...doc.firm_ids, ...heatHits.map((h) => h.firm_id)]),
      ],
      concept_ids: doc.concept_ids,
      metadata: {
        topic: doc.topic,
        domain: doc.domain,
        difficulty: doc.difficulty,
        dense_score: dense,
        heat_intensity: lexical.heat,
        weak_topic: Boolean(doc.topic && weak_topics.includes(doc.topic)),
        provenance_quality: provenanceQuality(doc.provenance),
        source_label: doc.source_label,
        backend: "real_rag_embeddings",
      },
      breakdown: {
        ...lexical,
        total: hybrid,
      },
      topic: doc.topic,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, retrieve_k);
}

export type BuildRealRagPackInput = BuildPackInput & {
  queryEmbedding: number[];
  embeddedDocuments: EmbeddedDocument[];
  grounded_answer?: string | null;
};

export function buildRealRagPack(
  input: BuildRealRagPackInput,
): PseudoRagPackResult {
  const limit = input.limit ?? 8;
  const weak_topics = input.weak_topics ?? [];
  const notes: string[] = [
    "Backend: real RAG — Gemini embeddings (768-d) + hybrid heat/weakness rerank.",
    "Glassdoor bank rows used for topic heat only — pack items are teaching corpus with citations.",
  ];
  if (input.grounded_answer) {
    notes.push("Grounded synthesis attached (cited pack items only).");
  }

  let ranked = retrieveWithEmbeddings({
    query: input.query,
    queryEmbedding: input.queryEmbedding,
    documents: input.embeddedDocuments,
    heat: input.heat,
    firm_ids: input.firm_ids,
    weak_topics,
    retrieve_k: input.retrieve_k ?? 40,
  });

  ranked = filterByHeatAndWeakness(ranked, {
    heat: input.heat,
    firm_ids: input.firm_ids,
    weak_topics,
    hot_topics: topHeatTopics(input.heat, input.firm_ids, 12).map(
      (t) => t.topic_id,
    ),
  });

  const selected = ranked.slice(0, limit);
  for (const h of selected) {
    if (!h.provenance) {
      throw new Error(`Refusing uncited pack item ${h.id}`);
    }
    if (h.provenance === "glassdoor_occurrence") {
      throw new Error(
        `Refusing glassdoor_occurrence as teaching pack item ${h.id}`,
      );
    }
  }

  const pack: PseudoRagPack = PseudoRagPackSchema.parse({
    query: input.query,
    firm_ids: input.firm_ids,
    item_ids: selected.map((h) => h.id),
    scores: selected.map((h) => Number(h.score.toFixed(6))),
    citations: selected.map((h) => ({
      item_id: h.id,
      provenance: h.provenance!,
      label: h.title.slice(0, 120),
    })),
    frozen_at: new Date().toISOString(),
  });

  const explanations = selected.map((h) =>
    explainHit(h, input.heat, input.firm_ids, weak_topics),
  );
  const metadata: PseudoRagPackMetadata = {
    backend: "real_rag_embeddings",
    explanations,
    heat_topics_used: [
      ...new Set(
        explanations.flatMap((e) => e.heat_hits.map((h) => h.topic_id)),
      ),
    ],
    weak_topics_used: weak_topics,
    candidate_count: ranked.length,
    notes,
  };

  if (input.grounded_answer) {
    metadata.notes.push(`Answer: ${input.grounded_answer.slice(0, 500)}`);
  }

  return { pack, metadata, hits: selected };
}
