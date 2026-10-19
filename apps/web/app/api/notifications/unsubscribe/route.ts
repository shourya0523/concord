import { NextResponse } from "next/server";
import { patchPrepProfile } from "@/lib/notify/profile-patch";
import { escapeHtml } from "@/lib/notify/templates";
import { signingSecret, verifyUnsubscribeToken } from "@/lib/notify/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click email unsubscribe (plan P6.2).
 *
 * GET  — link in the email footer: turns off `notify_email` and shows a
 *        small confirmation page.
 * POST — RFC 8058 `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
 *
 * No session needed: the HMAC-signed token identifies the user, and the write
 * runs under RLS as that user (`patchPrepProfile` → withRlsUserId).
 */
async function unsubscribe(token: string | null): Promise<"ok" | "invalid" | "error"> {
  const payload = verifyUnsubscribeToken(token, signingSecret());
  if (!payload) return "invalid";
  try {
    await patchPrepProfile({ userId: payload.u, patch: { notify_email: false } });
    return "ok";
  } catch (err) {
    console.warn("[notifications/unsubscribe] failed", err);
    return "error";
  }
}

function page(status: number, title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Concord</title></head>
<body style="margin:0;background:#f7f4ec;color:#1f1d1a;font-family:Georgia,'Times New Roman',serif;">
<main style="max-width:480px;margin:12vh auto;padding:28px;border:1px solid #d9d3c5;background:#fffdf8;">
<p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b665d;">Concord</p>
<h1 style="margin:0 0 14px;font-size:26px;font-weight:normal;">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${escapeHtml(body)}</p>
<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;"><a href="/settings" style="color:#1f1d1a;">Reminder settings</a></p>
</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await unsubscribe(token);
  if (result === "invalid") {
    return page(400, "Link not valid", "This unsubscribe link is invalid or incomplete. You can turn off emails in Settings instead.");
  }
  if (result === "error") {
    return page(500, "Something went wrong", "We couldn't update your email preference. Please try again, or turn off emails in Settings.");
  }
  return page(200, "You're unsubscribed", "Concord won't send you reminder or recap emails any more. Push reminders, if on, are unchanged — you can turn emails back on in Settings.");
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await unsubscribe(token);
  const status = result === "ok" ? 200 : result === "invalid" ? 400 : 500;
  return new NextResponse(result === "ok" ? "Unsubscribed" : "Unsubscribe failed", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
