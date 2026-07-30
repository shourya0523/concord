/**
 * Search API helpers consumed by backend/frontend.
 * Returns @ibpe/contracts SearchResponse shapes.
 */
import {
  SearchRequestSchema,
  SearchResponseSchema,
  type SearchRequest,
  type SearchResponse,
  type TopicHeat,
} from "@ibpe/contracts";
import { rankDocuments } from "./rank.js";
import type { RankedHit, SearchOptions, TeachingDocument } from "./types.js";

export type SearchCorpusInput = {
  request: SearchRequest | Record<string, unknown>;
  documents: TeachingDocument[];
  heat?: TopicHeat[];
  weak_topics?: string[];
  weights?: SearchOptions["weights"];
};

export type SearchCorpusResult = SearchResponse & {
  ranked: RankedHit[];
  backend: "in_memory_hybrid";
};

export function searchCorpus(input: SearchCorpusInput): SearchCorpusResult {
  const started = Date.now();
  const request = SearchRequestSchema.parse(input.request);
  const ranked = rankDocuments(request.q, input.documents, {
    heat: input.heat ?? [],
    firm_ids: request.firm_ids,
    weak_topics: input.weak_topics ?? [],
    weights: input.weights,
    topics: request.topics,
    domains: request.domains.map(String),
    provenance: request.provenance,
  });

  const slice = ranked.slice(request.offset, request.offset + request.limit);
  const response = SearchResponseSchema.parse({
    query: request,
    hits: slice.map(({ breakdown: _b, topic: _t, ...hit }) => hit),
    total: ranked.length,
    next_cursor:
      request.offset + request.limit < ranked.length
        ? String(request.offset + request.limit)
        : null,
    took_ms: Date.now() - started,
  });

  return {
    ...response,
    ranked: slice,
    backend: "in_memory_hybrid",
  };
}
