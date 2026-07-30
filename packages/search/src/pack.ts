/**
 * Pseudo-RAG pack builder:
 * retrieve → filter by heat/weakness → rerank → freeze + cite.
 *
 * Every pack item cites ProvenanceEnum (github_source / static_seed / …).
 * No uncited web answers. Glassdoor is heat only.
 */
import {
  PseudoRagPackSchema,
  type PseudoRagPack,
  type TopicHeat,
} from "@ibpe/contracts";
import { heatForTopic, topHeatTopics } from "./heat.js";
import { rankDocuments } from "./rank.js";
import type {
  BuildPackInput,
  PackItemExplanation,
  PseudoRagPackMetadata,
  PseudoRagPackResult,
  RankedHit,
  TeachingDocument,
} from "./types.js";

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
  if (weak_topic_hit && topic) {
    reasons.push(`Weak topic match: ${topic}`);
  }
  for (const h of heatHits) {
    reasons.push(
      `Hot for ${h.firm_id} on ${h.topic_id} (intensity ${h.intensity.toFixed(2)}, n=${h.sample_size})`,
    );
  }
  if (hit.breakdown.text > 0.2 || hit.breakdown.lexical_vector > 0.2) {
    reasons.push("Lexical / prompt relevance");
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

/**
 * Filter retrieve pool: prefer heat∩weakness, then heat, then weakness, then rest.
 * Always corpus-grounded (already true for TeachingDocument).
 */
export function filterByHeatAndWeakness(
  hits: RankedHit[],
  opts: {
    heat: TopicHeat[];
    firm_ids: string[];
    weak_topics: string[];
    hot_topics?: string[];
  },
): RankedHit[] {
  const weak = new Set(opts.weak_topics);
  const hot =
    opts.hot_topics ??
    topHeatTopics(opts.heat, opts.firm_ids, 12).map((t) => t.topic_id);
  const hotSet = new Set(hot);

  const tier = (h: RankedHit): number => {
    const t = h.topic;
    const isWeak = Boolean(t && weak.has(t));
    const isHot = Boolean(t && hotSet.has(t));
    if (isWeak && isHot) return 0;
    if (isHot) return 1;
    if (isWeak) return 2;
    return 3;
  };

  return [...hits].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    return b.score - a.score;
  });
}

/** Rerank with stronger heat + weakness weights for Mode A packs. */
export function rerankForPack(
  query: string,
  documents: TeachingDocument[],
  opts: {
    heat: TopicHeat[];
    firm_ids: string[];
    weak_topics: string[];
  },
): RankedHit[] {
  return rankDocuments(query, documents, {
    ...opts,
    weights: {
      text: 0.28,
      trigram: 0.12,
      lexical_vector: 0.15,
      heat: 0.25,
      weakness: 0.15,
      provenance_quality: 0.05,
    },
  });
}

export function freezePack(
  query: string,
  firm_ids: string[],
  hits: RankedHit[],
  frozen_at: string = new Date().toISOString(),
): PseudoRagPack {
  return PseudoRagPackSchema.parse({
    query,
    firm_ids,
    item_ids: hits.map((h) => h.id),
    scores: hits.map((h) => Number(h.score.toFixed(6))),
    citations: hits.map((h) => {
      if (!h.provenance) {
        throw new Error(`Pack item ${h.id} missing provenance citation`);
      }
      return {
        item_id: h.id,
        provenance: h.provenance,
        label: h.title.slice(0, 120),
      };
    }),
    frozen_at,
  });
}

export function buildPseudoRagPack(input: BuildPackInput): PseudoRagPackResult {
  const limit = input.limit ?? 8;
  const retrieve_k = input.retrieve_k ?? 40;
  const weak_topics = input.weak_topics ?? [];
  const notes: string[] = [
    "Backend: in-memory hybrid (FTS/trigram/lexical-vector stand-ins). Neon pgvector/FTS not required.",
    "Glassdoor bank rows used for topic heat only — pack items are teaching corpus with citations.",
  ];

  // 1) Retrieve
  let ranked = rerankForPack(input.query, input.documents, {
    heat: input.heat,
    firm_ids: input.firm_ids,
    weak_topics,
  }).slice(0, retrieve_k);

  // 2) Filter / tier by heat ∩ weakness
  ranked = filterByHeatAndWeakness(ranked, {
    heat: input.heat,
    firm_ids: input.firm_ids,
    weak_topics,
  });

  // 3) Take top-N (already reranked)
  const selected = ranked.slice(0, limit);

  // Refuse empty citations
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

  // 4) Freeze + cite
  const pack = freezePack(input.query, input.firm_ids, selected);
  const explanations = selected.map((h) =>
    explainHit(h, input.heat, input.firm_ids, weak_topics),
  );
  const heat_topics_used = [
    ...new Set(
      explanations.flatMap((e) => e.heat_hits.map((h) => h.topic_id)),
    ),
  ];
  const metadata: PseudoRagPackMetadata = {
    backend: "in_memory_hybrid",
    explanations,
    heat_topics_used,
    weak_topics_used: weak_topics,
    candidate_count: ranked.length,
    notes,
  };

  return { pack, metadata, hits: selected };
}
