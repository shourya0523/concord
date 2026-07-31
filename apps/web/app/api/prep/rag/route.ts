import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import {
  PrepRagRequestSchema,
  PrepRagResponseSchema,
} from "@/lib/api/schemas";
import { buildPrepRagPack } from "@/lib/data/prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/prep/rag — real RAG pack (embeddings + heat) with lexical fallback. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(PrepRagRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    return respondTyped(PrepRagResponseSchema, await buildPrepRagPack(parsed.data));
  } catch (err) {
    return handleRouteError(err);
  }
}
