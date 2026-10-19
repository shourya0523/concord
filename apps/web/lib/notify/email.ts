/**
 * Provider-agnostic email sender (plan P6.2, OQ-3 → Resend).
 *
 * `getEmailSender()` returns the Resend sender when RESEND_API_KEY and
 * NOTIFY_FROM_EMAIL are set, otherwise a no-op sender that reports
 * `{ status: "skipped", reason }` so callers never fail on missing keys.
 */
import { emailConfig, type EmailConfig } from "./config"

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
  /** Provider-side dedupe key (the notification_log id). */
  idempotencyKey?: string
}

export type EmailSendResult =
  | { status: "sent"; provider: string; id: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; provider: string; error: string; httpStatus?: number }

export interface EmailSender {
  readonly provider: string
  readonly configured: boolean
  send(message: EmailMessage): Promise<EmailSendResult>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const RESEND_ENDPOINT = "https://api.resend.com/emails"

export function noopEmailSender(reason: string): EmailSender {
  return {
    provider: "none",
    configured: false,
    async send() {
      return { status: "skipped", reason }
    },
  }
}

export function resendEmailSender(
  config: EmailConfig,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): EmailSender {
  return {
    provider: "resend",
    configured: true,
    async send(message) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      }
      if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey
      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(config.replyTo ? { reply_to: config.replyTo } : {}),
            ...(message.headers ? { headers: message.headers } : {}),
          }),
        })
        const raw = await response.text()
        let body: Record<string, unknown> = {}
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        } catch {
          body = { message: raw.slice(0, 200) }
        }
        if (!response.ok) {
          return {
            status: "failed",
            provider: "resend",
            httpStatus: response.status,
            error: String(body.message ?? body.name ?? `HTTP ${response.status}`).slice(0, 300),
          }
        }
        return {
          status: "sent",
          provider: "resend",
          id: typeof body.id === "string" ? body.id : null,
        }
      } catch (err) {
        return {
          status: "failed",
          provider: "resend",
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}

export function getEmailSender(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): EmailSender {
  const config = emailConfig(env)
  if (!config) return noopEmailSender("RESEND_API_KEY or NOTIFY_FROM_EMAIL unset")
  return resendEmailSender(config, fetchImpl)
}

/** RFC 8058 one-click unsubscribe headers for bulk senders (Gmail/Yahoo). */
export function listUnsubscribeHeaders(unsubscribeUrl: string | null): Record<string, string> {
  if (!unsubscribeUrl) return {}
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}
