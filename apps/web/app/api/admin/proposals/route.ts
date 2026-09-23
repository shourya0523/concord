import { NextRequest } from "next/server";

import { requireAdminForApi } from "@/lib/admin/session";
import { ReviewStoreError, decideProposal, listProposals } from "@/lib/admin/review-store";
import {
  ProposalDecisionResponseSchema,
  ProposalDecisionSchema,
  ProposalListQuerySchema,
  ProposalListResponseSchema,
} from "@/lib/api/admin-schemas";
import { jsonError, parseOrError, respondTyped } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function storeError(err: unknown) {
  if (err instanceof ReviewStoreError) return jsonError(err.status, err.code, err.message);
  console.error("[admin] proposals request failed", err);
  return jsonError(500, "internal_error", "Review queue request failed");
}

/** GET /api/admin/proposals?status=pending&target_kind=rubric&q=&min_confidence=&limit=&offset= */
export async function GET(request: NextRequest) {
  const gate = await requireAdminForApi();
  if (!gate.ok) return gate.response;
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = parseOrError(ProposalListQuerySchema, params);
  if (!parsed.ok) return parsed.response;
  try {
    return respondTyped(ProposalListResponseSchema, await listProposals(parsed.data));
  } catch (err) {
    return storeError(err);
  }
}

/** POST /api/admin/proposals {action: approve|reject|edit, id, proposal_json?, note?} */
export async function POST(request: NextRequest) {
  const gate = await requireAdminForApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON");
  }
  const parsed = parseOrError(ProposalDecisionSchema, body);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await decideProposal(parsed.data, gate.reviewer);
    return respondTyped(ProposalDecisionResponseSchema, result);
  } catch (err) {
    return storeError(err);
  }
}
