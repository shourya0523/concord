import { getApiUser } from "@/lib/api/auth";
import { handleRouteError, parseOrError, respondTyped } from "@/lib/api/http";
import { featureFlags } from "@/lib/flags";
import {
  getNotifyPrefs,
  NotifyPrefsResponseSchema,
  NotifyPrefsUpdateSchema,
  setNotifyPaused,
} from "@/lib/notify/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function flags() {
  const all = featureFlags();
  return { notifications: all.notifications, leagues: all.leagues };
}

/**
 * GET /api/notifications/prefs — "pause all" state, provider availability,
 * VAPID public key and push unlock. Timing/channel prefs are on the profile
 * (GET/PUT /api/profile).
 */
export async function GET() {
  try {
    const user = await getApiUser("view notification settings");
    if (!user.ok) return user.response;
    return respondTyped(NotifyPrefsResponseSchema, await getNotifyPrefs(user.userId, flags()));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** PUT /api/notifications/prefs — `{ paused }` (pause / resume all reminders). */
export async function PUT(request: Request) {
  try {
    const user = await getApiUser("update notification settings");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(NotifyPrefsUpdateSchema, body);
    if (!parsed.ok) return parsed.response;
    await setNotifyPaused({ userId: user.userId, email: user.email, paused: parsed.data.paused });
    return respondTyped(NotifyPrefsResponseSchema, await getNotifyPrefs(user.userId, flags()));
  } catch (err) {
    return handleRouteError(err);
  }
}
