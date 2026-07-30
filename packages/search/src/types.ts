/**
 * Shared search types. Align pack/hit shapes with @ibpe/contracts;
 * pack explanation metadata lives alongside PseudoRagPack (contracts omit it).
 */
import type {
  Provenance,
  PseudoRagPack,
  SearchHit,
  SearchRequest,
  SearchResponse,
  TopicHeat,
} from "@ibpe/contracts";

/** Teaching document eligible for packs / search hits (never Glassdoor prose as answer). */
export type TeachingDocument = {
  id: string;
  title: string;
  body: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  /** Product provenance for citations. */
  provenance: Provenance;
  concept_ids: string[];
  /** Optional firm soft tags from enrichment — not Glassdoor heat. */
  firm_ids: string[];
  source_label?: string;
};

export type BankOccurrenceRow = {
  id: string;
  company: string;
  track: string;
  position: string;
  question: string;
  date_posted?: string | null;
  scraped_at?: string;
};

export type HeatQuery = {
  firm_ids: string[];
  /** Restrict to these topic ids (optional). */
  topic_ids?: string[];
  /** ISO window label for metadata only (in-memory has no date filter by default). */
  window?: string;
};

export type HeatResult = {
  rows: TopicHeat[];
  /** Aggregated intensity per topic across the firm set (max). */
  by_topic: Record<string, number>;
  method: "glassdoor_occurrence";
  backend: "in_memory_bank";
};

export type ScoreBreakdown = {
  text: number;
  trigram: number;
  lexical_vector: number;
  heat: number;
  weakness: number;
  provenance_quality: number;
  total: number;
};

export type RankedHit = SearchHit & {
  breakdown: ScoreBreakdown;
  topic: string | null;
};

export type FacetBucket = {
  value: string;
  count: number;
};

export type SearchFacets = {
  topics: FacetBucket[];
  domains: FacetBucket[];
  provenance: FacetBucket[];
  difficulties: FacetBucket[];
};

export type SearchOptions = {
  documents: TeachingDocument[];
  heat?: TopicHeat[];
  weak_topics?: string[];
  /** Weights for hybrid blend (should sum ~1; normalised internally). */
  weights?: Partial<{
    text: number;
    trigram: number;
    lexical_vector: number;
    heat: number;
    weakness: number;
    provenance_quality: number;
  }>;
};

export type PackItemExplanation = {
  item_id: string;
  topic: string | null;
  heat_hits: Array<{ firm_id: string; topic_id: string; intensity: number }>;
  weak_topic_hit: boolean;
  reasons: string[];
};

export type PseudoRagPackMetadata = {
  backend: "in_memory_hybrid";
  /** Why items were included — weak-topic and heat explanations. */
  explanations: PackItemExplanation[];
  heat_topics_used: string[];
  weak_topics_used: string[];
  candidate_count: number;
  notes: string[];
};

export type PseudoRagPackResult = {
  pack: PseudoRagPack;
  metadata: PseudoRagPackMetadata;
  hits: RankedHit[];
};

export type BuildPackInput = {
  query: string;
  firm_ids: string[];
  documents: TeachingDocument[];
  heat: TopicHeat[];
  weak_topics?: string[];
  limit?: number;
  /** Retrieve pool before heat/weakness filter (default 40). */
  retrieve_k?: number;
};

export type { SearchRequest, SearchResponse, SearchHit, TopicHeat, PseudoRagPack, Provenance };
