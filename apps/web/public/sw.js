/*
 * Concord service worker — Web Push reminders only (plan P6.3).
 * No fetch handler and no caching: the app stays network-first.
 *
 * Payload (JSON, from lib/notify/templates.ts renderPush):
 *   { title, body, url, tag }
 */
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function parsePayload(event) {
  const fallback = { title: "Concord", body: "Your daily set is ready.", url: "/today", tag: "concord" }
  if (!event.data) return fallback
  try {
    const data = event.data.json()
    return {
      title: typeof data.title === "string" ? data.title : fallback.title,
      body: typeof data.body === "string" ? data.body : fallback.body,
      url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : fallback.url,
      tag: typeof data.tag === "string" ? data.tag : fallback.tag,
    }
  } catch {
    return { ...fallback, body: event.data.text() || fallback.body }
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePayload(event)
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: false,
      icon: "/brand/concord-mark.png",
      data: { url: payload.url },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.url) || "/today"
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (!client.url.startsWith(self.location.origin)) continue
        if ("focus" in client) {
          if ("navigate" in client && client.url !== target) {
            return client.navigate(target).then((c) => (c ? c.focus() : client.focus()))
          }
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})

self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser rotated the subscription: re-subscribe with the same key and
  // tell the server. Cookies authenticate the request (same origin).
  const old = event.oldSubscription
  const options = old && old.options ? old.options : null
  if (!options || !options.applicationServerKey) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => undefined),
  )
})
