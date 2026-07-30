/**
 * Facet helpers over ranked / corpus documents for search UI filters.
 */
import type { TeachingDocument, FacetBucket, SearchFacets, RankedHit } from "./types.js";

function buckets(values: Array<string | null | undefined>, limit = 30): FacetBucket[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export function buildFacetsFromDocuments(documents: TeachingDocument[]): SearchFacets {
  return {
    topics: buckets(documents.map((d) => d.topic)),
    domains: buckets(documents.map((d) => d.domain)),
    provenance: buckets(documents.map((d) => d.provenance)),
    difficulties: buckets(documents.map((d) => d.difficulty)),
  };
}

export function buildFacetsFromHits(hits: RankedHit[]): SearchFacets {
  return {
    topics: buckets(hits.map((h) => h.topic)),
    domains: buckets(hits.map((h) => String(h.metadata.domain ?? ""))),
    provenance: buckets(hits.map((h) => h.provenance)),
    difficulties: buckets(hits.map((h) => String(h.metadata.difficulty ?? ""))),
  };
}

/** Alias expected by backend consumers. */
export function buildFacets(
  input: TeachingDocument[] | RankedHit[],
): SearchFacets {
  if (input.length === 0) {
    return { topics: [], domains: [], provenance: [], difficulties: [] };
  }
  if ("breakdown" in input[0]!) {
    return buildFacetsFromHits(input as RankedHit[]);
  }
  return buildFacetsFromDocuments(input as TeachingDocument[]);
}
