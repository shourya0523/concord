import { getApiUser } from "@/lib/api/auth";
import { handleRouteError, jsonError, parseOrError, respondTyped } from "@/lib/api/http";
import {
  JoinLeagueRequestSchema,
  LeagueResponseSchema,
  setLeagueOptIn,
} from "@/lib/data/leagues";
import { isFlagOn } from "@/lib/flags";
import { ProfileUnavailableError } from "@/lib/notify/profile-patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(err: unknown) {
  if (err instanceof ProfileUnavailableError) {
    return jsonError(503, "profile_unavailable", err.message);
  }
  return handleRouteError(err);
}

/** POST /api/leagues/membership — opt in (optional `{ cohort: "2027 SA" }`). */
export async function POST(request: Request) {
  try {
    if (!isFlagOn("leagues")) {
      return jsonError(404, "feature_disabled", "Leagues are turned off");
    }
    const user = await getApiUser("join a league");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(JoinLeagueRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const result = await setLeagueOptIn({
      userId: user.userId,
      email: user.email,
      optIn: true,
      cohort: parsed.data.cohort ?? null,
    });
    return respondTyped(LeagueResponseSchema, result);
  } catch (err) {
    return handle(err);
  }
}

/** DELETE /api/leagues/membership — opt out and leave this week's league. */
export async function DELETE() {
  try {
    if (!isFlagOn("leagues")) {
      return jsonError(404, "feature_disabled", "Leagues are turned off");
    }
    const user = await getApiUser("leave your league");
    if (!user.ok) return user.response;
    const result = await setLeagueOptIn({ userId: user.userId, email: user.email, optIn: false });
    return respondTyped(LeagueResponseSchema, result);
  } catch (err) {
    return handle(err);
  }
}
