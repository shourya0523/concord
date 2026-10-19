import { getApiUser } from "@/lib/api/auth";
import { handleRouteError, jsonError, jsonOk, parseOrError } from "@/lib/api/http";
import { isFlagOn } from "@/lib/flags";
import { vapidConfig } from "@/lib/notify/config";
import {
  PushEndpointConflictError,
  PushSubscribeRequestSchema,
  PushUnsubscribeRequestSchema,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/notify/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/push/subscribe — store this browser's Web Push subscription. */
export async function POST(request: Request) {
  try {
    const user = await getApiUser("enable push reminders");
    if (!user.ok) return user.response;
    if (!isFlagOn("notifications")) {
      return jsonError(404, "feature_disabled", "Notifications are turned off");
    }
    if (!vapidConfig()) {
      return jsonError(503, "push_not_configured", "Web push is not configured on this deployment");
    }
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(PushSubscribeRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    await savePushSubscription({
      userId: user.userId,
      email: user.email,
      subscription: parsed.data,
      userAgent: request.headers.get("user-agent"),
    });
    return jsonOk({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof PushEndpointConflictError) {
      return jsonError(409, "endpoint_conflict", err.message);
    }
    return handleRouteError(err);
  }
}

/** DELETE /api/push/subscribe — forget this browser's subscription. */
export async function DELETE(request: Request) {
  try {
    const user = await getApiUser("disable push reminders");
    if (!user.ok) return user.response;
    const body = await request.json().catch(() => ({}));
    const parsed = parseOrError(PushUnsubscribeRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const removed = await removePushSubscription({
      userId: user.userId,
      endpoint: parsed.data.endpoint,
    });
    return jsonOk({ ok: true, removed });
  } catch (err) {
    return handleRouteError(err);
  }
}
