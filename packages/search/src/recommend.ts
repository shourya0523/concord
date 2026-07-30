/**
 * Lightweight recommendation helpers with explanation metadata.
 */
import type { TopicHeat } from "@ibpe/contracts";
import { topHeatTopics } from "./heat.js";
import { rankDocuments } from "./rank.js";
import type { RankedHit, TeachingDocument } from "./types.js";

export type Recommendation = {
  item_id: string;
  title: string;
  score: number;
  provenance: string;
  reasons: string[];
};

export function recommendForTargets(input: {
  documents: TeachingDocument[];
  heat: TopicHeat[];
  firm_ids: string[];
  weak_topics?: string[];
  query?: string;
  limit?: number;
}): Recommendation[] {
  const weak = input.weak_topics ?? [];
  const hot = topHeatTopics(input.heat, input.firm_ids, 10).map((t) => t.topic_id);
  const hotSet = new Set(hot);
  const ranked = rankDocuments(input.query ?? "", input.documents, {
    heat: input.heat,
    firm_ids: input.firm_ids,
    weak_topics: weak,
    weights: {
      text: 0.2,
      trigram: 0.1,
      lexical_vector: 0.1,
      heat: 0.3,
      weakness: 0.25,
      provenance_quality: 0.05,
    },
  }).slice(0, input.limit ?? 10);

  return ranked.map((h: RankedHit) => {
    const reasons: string[] = [];
    if (h.topic && weak.includes(h.topic)) {
      reasons.push(`Low mastery / weak topic: ${h.topic}`);
    }
    if (h.topic && hotSet.has(h.topic)) {
      reasons.push(`Hot topic for your targets: ${h.topic}`);
    }
    if (input.query?.trim()) {
      reasons.push("Matches your focus prompt");
    }
    if (h.provenance === "github_source" || h.provenance === "static_seed") {
      reasons.push(`Grounded teaching source (${h.provenance})`);
    }
    if (reasons.length === 0) reasons.push("High hybrid rank for your set");
    return {
      item_id: h.id,
      title: h.title,
      score: h.score,
      provenance: h.provenance ?? "unknown",
      reasons,
    };
  });
}
