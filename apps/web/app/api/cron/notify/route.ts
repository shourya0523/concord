import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { refreshLeagueXp } from "@/lib/data/leagues";
import { featureFlags } from "@/lib/flags";
import { appBaseUrl, isAuthorizedCron } from "@/lib/notify/config";
import { getCronSql, roleBypassesRls } from "@/lib/notify/db";
import { notifyCadence } from "@/lib/notify/plan";
import { getEmailSender } from "@/lib/notify/email";
import { getPushSender } from "@/lib/notify/push";
import { runNotify } from "@/lib/notify/run";
import { postgresNotifyStore } from "@/lib/notify/store";
import { signingSecret } from "@/lib/notify/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/notify — hourly reminder run (plan P6.4) + league XP refresh.
 *
 * Guarded by `Authorization: Bearer ${CRON_SECRET}` (Vercel sends it for
 * crons in apps/web/vercel.json). Spans users, so it uses the cron/owner
 * connection without the RLS GUC — see lib/notify/db.ts.
 *
 * Query: `?dry_run=1` plans without claiming or sending; with dry_run,
 * `&now=<ISO>` simulates another time.
 *
 * Streak freeze rollover is not applied here: the retention track owns
 * streak writes and exposes no rollover function yet; the planner treats a
 * stale streak as broken (see liveStreak) so reminders stay correct.
 */
export async function GET(request: Request) {
  try {
    if (!isAuthorizedCron(request.headers.get("authorization"))) {
      return jsonError(401, "unauthorized", "Cron secret required");
    }
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    let now = new Date();
    const nowParam = url.searchParams.get("now");
    if (dryRun && nowParam) {
      const parsed = new Date(nowParam);
      if (Number.isNaN(parsed.getTime())) {
        return jsonError(400, "validation_error", "now must be an ISO timestamp");
      }
      now = parsed;
    }

    const flags = featureFlags();
    if (!flags.notifications && !flags.leagues) {
      return jsonOk({ ok: true, skipped: "notifications and leagues flags are off" });
    }
    const sql = getCronSql();
    if (!sql) return jsonOk({ ok: true, skipped: "no database configured" });

    const rlsBypass = await roleBypassesRls(sql);
    const notes: string[] = [];
    if (!rlsBypass) {
      notes.push(
        "Cron role does not bypass RLS: cross-user queries see no rows. Set CRON_DATABASE_URL to the owner URL.",
      );
    }

    const notify = flags.notifications
      ? await runNotify({
          store: postgresNotifyStore(sql),
          email: getEmailSender(),
          push: getPushSender(),
          now,
          appUrl: appBaseUrl(),
          signingSecret: signingSecret(),
          dryRun,
          cadence: notifyCadence(),
        })
      : null;
    if (notify && !notify.channels.email && !notify.channels.push) {
      notes.push("No email or push provider configured — nothing sent.");
    }

    let leagueRowsUpdated: number | null = null;
    if (flags.leagues && !dryRun) {
      try {
        leagueRowsUpdated = await refreshLeagueXp(sql, now);
      } catch (err) {
        console.warn("[cron/notify] league XP refresh failed", err);
        notes.push("League XP refresh failed.");
      }
    }

    console.info("[cron/notify]", JSON.stringify({ notify, leagueRowsUpdated, rlsBypass }));
    return jsonOk({
      ok: true,
      rls_bypass: rlsBypass,
      notify,
      leagues: { xp_rows_updated: leagueRowsUpdated },
      notes,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
