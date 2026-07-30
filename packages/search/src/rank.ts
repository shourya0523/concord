/**
 * Hybrid ranking blend: lexical FTS-ish + trigram + bag-of-tokens "vector"
 * + firm topic heat + user weakness + provenance quality.
 */
import type { Provenance } from "@ibpe/contracts";
import { heatForTopic } from "./heat.js";
import {
  cosineSparse,
  lexicalVector,
  scoreTextOverlap,
  tokenize,
  trigrams,
  jaccard,
} from "./text.js";
import type {
  RankedHit,
  ScoreBreakdown,
  SearchOptions,
  TeachingDocument,
} from "./types.js";
import type { TopicHeat } from "@ibpe/contracts";

const DEFAULT_WEIGHTS = {
  text: 0.32,
  trigram: 0.18,
  lexical_vector: 0.2,
  heat: 0.15,
  weakness: 0.1,
  provenance_quality: 0.05,
};

function provenanceQuality(p: Provenance): number {
  switch (p) {
    case "github_source":
      return 1;
    case "static_seed":
      return 0.95;
    case "editorial":
      return 0.85;
    case "gemini_synthesised":
      return 0.55;
    case "glassdoor_occurrence":
      return 0; // should not appear in teaching corpus
    default:
      return 0.4;
  }
}

function normalizeWeights(
  partial?: SearchOptions["weights"],
): typeof DEFAULT_WEIGHTS {
  const merged = { ...DEFAULT_WEIGHTS, ...partial };
  const sum = Object.values(merged).reduce((a, b) => a + b, 0) || 1;
  return {
    text: merged.text / sum,
    trigram: merged.trigram / sum,
    lexical_vector: merged.lexical_vector / sum,
    heat: merged.heat / sum,
    weakness: merged.weakness / sum,
    provenance_quality: merged.provenance_quality / sum,
  };
}

export function scoreDocument(
  query: string,
  doc: TeachingDocument,
  opts: {
    heat: TopicHeat[];
    firm_ids: string[];
    weak_topics: string[];
    weights?: SearchOptions["weights"];
  },
): ScoreBreakdown {
  const w = normalizeWeights(opts.weights);
  const qTokens = tokenize(query);
  const docText = `${doc.title}\n${doc.body}\n${doc.topic ?? ""}`;
  const dTokens = tokenize(docText);

  const text = qTokens.length
    ? scoreTextOverlap(qTokens, dTokens)
    : 0.15; // empty query → mild base so filters still rank
  const trigram = qTokens.length
    ? jaccard(trigrams(query), trigrams(docText))
    : 0.1;
  const lexical_vector = qTokens.length
    ? cosineSparse(lexicalVector(qTokens), lexicalVector(dTokens))
    : 0.1;

  const { intensity } = heatForTopic(opts.heat, opts.firm_ids, doc.topic);
  const heat = intensity;
  const weakness =
    doc.topic && opts.weak_topics.includes(doc.topic) ? 1 : 0;
  const provenance_quality = provenanceQuality(doc.provenance);

  const total =
    w.text * text +
    w.trigram * trigram +
    w.lexical_vector * lexical_vector +
    w.heat * heat +
    w.weakness * weakness +
    w.provenance_quality * provenance_quality;

  return {
    text,
    trigram,
    lexical_vector,
    heat,
    weakness,
    provenance_quality,
    total,
  };
}

export function rankDocuments(
  query: string,
  documents: TeachingDocument[],
  opts: {
    heat?: TopicHeat[];
    firm_ids?: string[];
    weak_topics?: string[];
    weights?: SearchOptions["weights"];
    topics?: string[];
    domains?: string[];
    provenance?: Provenance[];
  } = {},
): RankedHit[] {
  const heat = opts.heat ?? [];
  const firm_ids = opts.firm_ids ?? [];
  const weak_topics = opts.weak_topics ?? [];
  const topicFilter = opts.topics?.length ? new Set(opts.topics) : null;
  const domainFilter = opts.domains?.length ? new Set(opts.domains) : null;
  const provFilter = opts.provenance?.length ? new Set(opts.provenance) : null;

  const hits: RankedHit[] = [];
  for (const doc of documents) {
    if (doc.provenance === "glassdoor_occurrence") continue;
    if (topicFilter && (!doc.topic || !topicFilter.has(doc.topic))) continue;
    if (domainFilter && (!doc.domain || !domainFilter.has(doc.domain))) continue;
    if (provFilter && !provFilter.has(doc.provenance)) continue;

    const breakdown = scoreDocument(query, doc, {
      heat,
      firm_ids,
      weak_topics,
      weights: opts.weights,
    });
    const { hits: heatHits } = heatForTopic(heat, firm_ids, doc.topic);
    hits.push({
      id: doc.id,
      kind: "canonical_question",
      title: doc.title,
      snippet: doc.body.slice(0, 220),
      score: breakdown.total,
      provenance: doc.provenance,
      firm_ids: [
        ...new Set([...doc.firm_ids, ...heatHits.map((h) => h.firm_id)]),
      ],
      concept_ids: doc.concept_ids,
      metadata: {
        topic: doc.topic,
        domain: doc.domain,
        difficulty: doc.difficulty,
        heat_intensity: breakdown.heat,
        weak_topic: Boolean(doc.topic && weak_topics.includes(doc.topic)),
        breakdown,
        source_label: doc.source_label,
      },
      breakdown,
      topic: doc.topic,
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
