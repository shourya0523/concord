/**
 * Notification env resolution. Every provider is optional: with no keys the
 * senders no-op and return `{ status: "skipped" }` (plan P6.2/P6.3).
 *
 * Server-only secrets: RESEND_API_KEY, NOTIFY_SIGNING_SECRET, VAPID_PRIVATE_KEY,
 * CRON_SECRET, CRON_DATABASE_URL. The only public value is
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY (a VAPID public key is meant to be public).
 */

type Env = Record<string, string | undefined>

function read(env: Env, key: string): string | null {
  const value = env[key]?.trim()
  return value ? value : null
}

/** Absolute origin used in email links (no trailing slash). */
export function appBaseUrl(env: Env = process.env): string {
  const explicit = read(env, "NEXT_PUBLIC_APP_URL")
  if (explicit) return explicit.replace(/\/+$/, "")
  const production = read(env, "VERCEL_PROJECT_PRODUCTION_URL")
  if (production) return `https://${production.replace(/\/+$/, "")}`
  const preview = read(env, "VERCEL_URL")
  if (preview) return `https://${preview.replace(/\/+$/, "")}`
  return "http://localhost:3000"
}

export type EmailConfig = { apiKey: string; from: string; replyTo: string | null }

export function emailConfig(env: Env = process.env): EmailConfig | null {
  const apiKey = read(env, "RESEND_API_KEY")
  const from = read(env, "NOTIFY_FROM_EMAIL")
  if (!apiKey || !from) return null
  return { apiKey, from, replyTo: read(env, "NOTIFY_REPLY_TO") }
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string }

export function vapidPublicKey(env: Env = process.env): string | null {
  return read(env, "NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? read(env, "VAPID_PUBLIC_KEY")
}

export function vapidConfig(env: Env = process.env): VapidConfig | null {
  const publicKey = vapidPublicKey(env)
  const privateKey = read(env, "VAPID_PRIVATE_KEY")
  if (!publicKey || !privateKey) return null
  const subject =
    read(env, "VAPID_SUBJECT") ??
    (read(env, "NOTIFY_FROM_EMAIL") ? `mailto:${read(env, "NOTIFY_FROM_EMAIL")}` : null) ??
    appBaseUrl(env)
  return { publicKey, privateKey, subject }
}

export type NotifyCapabilities = {
  email: boolean
  push: boolean
  vapidPublicKey: string | null
}

export function notifyCapabilities(env: Env = process.env): NotifyCapabilities {
  return {
    email: emailConfig(env) !== null,
    push: vapidConfig(env) !== null,
    vapidPublicKey: vapidPublicKey(env),
  }
}

/** `Authorization: Bearer ${CRON_SECRET}` — Vercel cron convention. */
export function isAuthorizedCron(
  authorization: string | null,
  env: Env = process.env,
): boolean {
  const secret = read(env, "CRON_SECRET")
  if (!secret || !authorization) return false
  const expected = `Bearer ${secret}`
  if (authorization.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
