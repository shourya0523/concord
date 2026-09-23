/**
 * HMAC-signed one-click unsubscribe tokens (plan P6.2).
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
 * The payload carries the app user id and the action only — no email — and
 * does not expire, so links in old emails keep working (RFC 8058 spirit).
 * Secret: NOTIFY_SIGNING_SECRET, falling back to CRON_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

export const UNSUBSCRIBE_ACTIONS = ["email"] as const
export type UnsubscribeAction = (typeof UNSUBSCRIBE_ACTIONS)[number]

export type UnsubscribePayload = {
  /** app.users.id (= Neon Auth user id). */
  u: string
  /** What to turn off. */
  a: UnsubscribeAction
  /** Issued-at, epoch seconds. */
  t: number
}

export function signingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.NOTIFY_SIGNING_SECRET?.trim() || env.CRON_SECRET?.trim()
  return secret ? secret : null
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function mac(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`concord-unsub.v1.${body}`).digest()
}

export function signUnsubscribeToken(
  userId: string,
  secret: string,
  options: { action?: UnsubscribeAction; now?: Date } = {},
): string {
  if (!secret) throw new Error("signing secret required")
  const payload: UnsubscribePayload = {
    u: userId,
    a: options.action ?? "email",
    t: Math.floor((options.now ?? new Date()).getTime() / 1000),
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${b64url(mac(body, secret))}`
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  secret: string | null,
): UnsubscribePayload | null {
  if (!token || !secret) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [body, signature] = parts as [string, string]
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null

  const expected = mac(body, secret)
  const given = Buffer.from(signature, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown
    if (!payload || typeof payload !== "object") return null
    const { u, a, t } = payload as Record<string, unknown>
    if (typeof u !== "string" || !u) return null
    if (!UNSUBSCRIBE_ACTIONS.includes(a as UnsubscribeAction)) return null
    if (typeof t !== "number") return null
    return { u, a: a as UnsubscribeAction, t }
  } catch {
    return null
  }
}

export function unsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
}
