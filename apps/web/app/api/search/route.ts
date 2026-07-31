import {
  SearchRequestSchema,
  SearchResponseSchema,
} from "@ibpe/contracts";
import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { hybridSearch } from "@/lib/data/rag";
import { getMultiFirmHeat } from "@/lib/data/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/search — real RAG hybrid when embeddings indexed;
 * lexical @ibpe/search fallback otherwise.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const raw = {
      q: url.searchParams.get("q") ?? "",
      limit: limitRaw != null && limitRaw !== "" ? Number(limitRaw) : 20,
      offset: offsetRaw != null && offsetRaw !== "" ? Number(offsetRaw) : 0,
      tracks: url.searchParams.getAll("track"),
      firm_ids: url.searchParams.getAll("firm_id"),
    };
    return runSearch(raw);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return runSearch(body);
  } catch (err) {
    return handleRouteError(err);
  }
}

async function runSearch(raw: unknown) {
  const parsed = parseOrError(SearchRequestSchema, raw);
  if (!parsed.ok) return parsed.response;

  const req = parsed.data;
  const heat =
    req.firm_ids.length > 0
      ? (await getMultiFirmHeat(req.firm_ids)).topics
      : [];

  const result = await hybridSearch({
    q: req.q,
    firm_ids: req.firm_ids,
    tracks: req.tracks.map(String),
    limit: req.limit,
    offset: req.offset,
    heat,
    weak_topics: req.topics,
  });

  return respondTyped(SearchResponseSchema, {
    query: result.query,
    hits: result.hits,
    total: result.total,
    next_cursor: result.next_cursor,
    took_ms: result.took_ms,
  });
}
