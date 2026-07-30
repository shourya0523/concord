import { z } from "zod";
import {
  handleRouteError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { QuestionListResponseSchema } from "@/lib/api/schemas";
import { listQuestions } from "@/lib/data/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  q: z.string().optional().default(""),
  track: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/** GET /api/questions — published corpus or bank fallback. No scrapes. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = parseOrError(QuerySchema, raw);
    if (!parsed.ok) return parsed.response;

    const result = await listQuestions({
      q: parsed.data.q || undefined,
      track: parsed.data.track,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return respondTyped(QuestionListResponseSchema, result);
  } catch (err) {
    return handleRouteError(err);
  }
}
