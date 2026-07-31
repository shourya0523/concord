import {
  SearchRequestSchema,
  SearchResponseSchema,
} from "@ibpe/contracts";
import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { listQuestions } from "@/lib/data/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/search — thin proxy until ibpe-search hybrid lands.
 * Uses published/bank list as a substring stand-in (no long scrapes).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const raw = {
      q: url.searchParams.get("q") ?? "",
      // Query strings are text — coerce before Zod number fields.
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
  const started = Date.now();
  const parsed = parseOrError(SearchRequestSchema, raw);
  if (!parsed.ok) return parsed.response;

  const req = parsed.data;
  const listed = await listQuestions({
    q: req.q,
    track: req.tracks?.[0],
    limit: req.limit,
    offset: req.offset,
  });

  const response = {
    query: req,
    hits: listed.items.map((q, i) => ({
      id: q.id,
      kind: "canonical_question" as const,
      title: q.canonical_wording.slice(0, 160),
      snippet: q.canonical_wording,
      score: Math.max(0, 1 - i * 0.01),
      provenance: undefined,
      firm_ids: req.firm_ids ?? [],
      concept_ids: [],
      metadata: { topic: q.topic, domain: q.domain },
    })),
    total: listed.total,
    next_cursor: null,
    took_ms: Date.now() - started,
  };

  return respondTyped(SearchResponseSchema, response);
}
