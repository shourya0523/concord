import {
  handleRouteError,
  jsonError,
  parseOrError,
  respondTyped,
} from "@/lib/api/http";
import { getApiUser } from "@/lib/api/auth";
import {
  MockReportRequestSchema,
  MockReportResponseSchema,
} from "@/lib/api/grading-ui-schemas";
import { recordLearningActivity } from "@/lib/data/activity";
import { getPracticeSession } from "@/lib/data/practice";
import { buildSessionReport } from "@/lib/simulator/report-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/practice/sessions/[id]/report — simulator after-action report
 * (plan 2026-09-23-001 P5.8). Aggregates the session's graded attempts into
 * per-stage scores, strongest / weakest topics and recommended concepts, with
 * a cited Gemini coaching paragraph when a key exists (deterministic summary
 * otherwise). Also records the `mock_complete` learning activity.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser("view mock reports");
    if (!user.ok) return user.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(MockReportRequestSchema, body);
    if (!parsed.ok) return parsed.response;

    const session = await getPracticeSession(id, user.userId);
    if (!session) return jsonError(404, "not_found", `Session not found: ${id}`);

    const report = await buildSessionReport({
      sessionId: id,
      userId: user.userId,
      session,
      body: parsed.data,
    });

    let activity = null;
    if (parsed.data.complete) {
      try {
        activity = await recordLearningActivity({
          userId: user.userId,
          email: user.email,
          kind: "mock_complete",
          // Stable per session so the retention track can de-duplicate re-posts.
          subjectId: `mock:${id}`,
          score: report.overall_score,
          scoreSource: report.attempts_source === "none" ? "self" : "mock",
          countsTowardGoal: report.graded_stages > 0,
        });
      } catch (err) {
        console.warn("[simulator-report] recordLearningActivity failed", err);
      }
    }

    return respondTyped(MockReportResponseSchema, {
      report,
      activity,
      note: `attempts from ${report.attempts_source}; summary ${report.summary_source}`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
