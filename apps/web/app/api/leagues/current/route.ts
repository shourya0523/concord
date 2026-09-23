import { getApiUser } from "@/lib/api/auth";
import { handleRouteError, jsonError, respondTyped } from "@/lib/api/http";
import { getCurrentLeague, LeagueResponseSchema } from "@/lib/data/leagues";
import { isFlagOn } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leagues/current — this week's league standings (anonymised
 * handles + XP + your rank). Joins lazily when opted in and not yet placed
 * this week; drops this week's row when opted out.
 */
export async function GET() {
  try {
    if (!isFlagOn("leagues")) {
      return jsonError(404, "feature_disabled", "Leagues are turned off");
    }
    const user = await getApiUser("view your league");
    if (!user.ok) return user.response;
    return respondTyped(
      LeagueResponseSchema,
      await getCurrentLeague({ userId: user.userId, email: user.email }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
