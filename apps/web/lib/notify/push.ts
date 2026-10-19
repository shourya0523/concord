/**
 * Web Push sender (plan P6.3) via the `web-push` package and VAPID keys.
 * No-op (`skipped`) when VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are unset.
 * A 404/410 from the push service means the subscription is gone — callers
 * delete it.
 */
import webpush from "web-push"
import { vapidConfig, type VapidConfig } from "./config"
import type { PushContent } from "./templates"

export type PushSubscriptionRecord = {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushSendResult =
  | { status: "sent"; httpStatus: number }
  | { status: "gone"; httpStatus: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; httpStatus?: number }

export interface PushSender {
  readonly configured: boolean
  send(subscription: PushSubscriptionRecord, content: PushContent): Promise<PushSendResult>
}

type SendNotification = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<{ statusCode: number }>

export const PUSH_TTL_SECONDS = 6 * 60 * 60

export function noopPushSender(reason: string): PushSender {
  return {
    configured: false,
    async send() {
      return { status: "skipped", reason }
    },
  }
}

export function webPushSender(
  config: VapidConfig,
  sendNotification: SendNotification = (sub, payload, options) =>
    webpush.sendNotification(sub, payload, options),
): PushSender {
  return {
    configured: true,
    async send(subscription, content) {
      try {
        const result = await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(content),
          {
            TTL: PUSH_TTL_SECONDS,
            urgency: "normal",
            topic: content.tag.slice(0, 32),
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
          },
        )
        return { status: "sent", httpStatus: result.statusCode }
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          return { status: "gone", httpStatus: statusCode }
        }
        return {
          status: "failed",
          httpStatus: statusCode,
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        }
      }
    },
  }
}

export function getPushSender(env: Record<string, string | undefined> = process.env): PushSender {
  const config = vapidConfig(env)
  if (!config) return noopPushSender("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY unset")
  return webPushSender(config)
}
