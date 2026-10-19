import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { appBaseUrl, isAuthorizedCron, notifyCapabilities, vapidConfig } from "./config"
import { getEmailSender, listUnsubscribeHeaders, RESEND_ENDPOINT } from "./email"
import { getPushSender, webPushSender } from "./push"
import {
  escapeHtml,
  renderDailyReminder,
  renderPush,
  renderStreakAtRisk,
  renderWeeklyRecap,
} from "./templates"

const LINKS = { appUrl: "https://concord.test", unsubscribeUrl: "https://concord.test/api/notifications/unsubscribe?token=a.b" }

describe("email sender", () => {
  it("is a no-op reporting skipped without keys", async () => {
    const sender = getEmailSender({})
    assert.equal(sender.configured, false)
    const result = await sender.send({ to: "a@x.test", subject: "s", html: "h", text: "t" })
    assert.equal(result.status, "skipped")
    assert.match((result as { reason: string }).reason, /RESEND_API_KEY/)
    assert.equal(getEmailSender({ RESEND_API_KEY: "k" }).configured, false, "needs a from address too")
  })

  it("posts to Resend with auth, idempotency key and unsubscribe headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const sender = getEmailSender(
      { RESEND_API_KEY: "re_test", NOTIFY_FROM_EMAIL: "Concord <hi@concord.test>" },
      async (url, init) => {
        calls.push({ url, init: init! })
        return new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
      },
    )
    const result = await sender.send({
      to: "a@x.test",
      subject: "Hello",
      html: "<p>h</p>",
      text: "h",
      headers: listUnsubscribeHeaders("https://u.test/x"),
      idempotencyKey: "u1:daily_reminder:email:2026-09-23",
    })
    assert.deepEqual(result, { status: "sent", provider: "resend", id: "email_123" })
    assert.equal(calls[0]?.url, RESEND_ENDPOINT)
    const headers = calls[0]?.init.headers as Record<string, string>
    assert.equal(headers.authorization, "Bearer re_test")
    assert.equal(headers["idempotency-key"], "u1:daily_reminder:email:2026-09-23")
    const body = JSON.parse(String(calls[0]?.init.body))
    assert.deepEqual(body.to, ["a@x.test"])
    assert.equal(body.from, "Concord <hi@concord.test>")
    assert.equal(body.headers["List-Unsubscribe"], "<https://u.test/x>")
  })

  it("reports provider errors and network errors as failed", async () => {
    const env = { RESEND_API_KEY: "k", NOTIFY_FROM_EMAIL: "a@b.test" }
    const rejected = getEmailSender(env, async () =>
      new Response(JSON.stringify({ name: "validation_error", message: "bad from" }), { status: 422 }),
    )
    assert.deepEqual(await rejected.send({ to: "a@x.test", subject: "s", html: "h", text: "t" }), {
      status: "failed",
      provider: "resend",
      httpStatus: 422,
      error: "bad from",
    })
    const offline = getEmailSender(env, async () => {
      throw new Error("ECONNRESET")
    })
    const result = await offline.send({ to: "a@x.test", subject: "s", html: "h", text: "t" })
    assert.equal(result.status, "failed")
  })
})

describe("push sender", () => {
  const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.test" }
  const sub = { endpoint: "https://push.test/1", p256dh: "p", auth: "a" }
  const content = renderPush("daily_reminder", { streak: 2, cardsDue: 3, cardsDoneToday: 0, goal: 8 })

  it("is a no-op without VAPID keys", async () => {
    const sender = getPushSender({})
    assert.equal(sender.configured, false)
    assert.equal((await sender.send(sub, content)).status, "skipped")
  })

  it("sends the JSON payload with VAPID details", async () => {
    let seen: { payload: string; options: Record<string, unknown> } | null = null
    const sender = webPushSender(config, async (_s, payload, options) => {
      seen = { payload, options: options as Record<string, unknown> }
      return { statusCode: 201 }
    })
    assert.deepEqual(await sender.send(sub, content), { status: "sent", httpStatus: 201 })
    assert.equal(JSON.parse(seen!.payload).url, "/today")
    assert.deepEqual(seen!.options.vapidDetails, config)
  })

  it("maps 404/410 to gone and other errors to failed", async () => {
    for (const statusCode of [404, 410]) {
      const sender = webPushSender(config, async () => {
        throw Object.assign(new Error("expired"), { statusCode })
      })
      assert.equal((await sender.send(sub, content)).status, "gone")
    }
    const sender = webPushSender(config, async () => {
      throw Object.assign(new Error("server"), { statusCode: 500 })
    })
    assert.equal((await sender.send(sub, content)).status, "failed")
  })
})

describe("config", () => {
  it("resolves the app URL", () => {
    assert.equal(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://a.test/" }), "https://a.test")
    assert.equal(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "p.vercel.app" }), "https://p.vercel.app")
    assert.equal(appBaseUrl({}), "http://localhost:3000")
  })

  it("prefers the public VAPID key and defaults the subject", () => {
    assert.equal(vapidConfig({ VAPID_PUBLIC_KEY: "a" }), null)
    assert.deepEqual(vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", NOTIFY_FROM_EMAIL: "hi@c.test" }), {
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:hi@c.test",
    })
    assert.deepEqual(notifyCapabilities({}), { email: false, push: false, vapidPublicKey: null })
  })

  it("guards the cron with the bearer secret", () => {
    const env = { CRON_SECRET: "abc" }
    assert.equal(isAuthorizedCron("Bearer abc", env), true)
    assert.equal(isAuthorizedCron("Bearer abd", env), false)
    assert.equal(isAuthorizedCron("abc", env), false)
    assert.equal(isAuthorizedCron(null, env), false)
    assert.equal(isAuthorizedCron("Bearer ", {}), false, "no secret configured → closed")
  })
})

describe("templates", () => {
  it("escapes HTML", () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
  })

  it("daily reminder: cards due, streak, CTA and unsubscribe", () => {
    const email = renderDailyReminder({ streak: 5, cardsDue: 1, cardsDoneToday: 3, goal: 8 }, LINKS)
    assert.equal(email.subject, "1 card due today")
    assert.ok(email.text.includes("1 review card is due"))
    assert.ok(email.text.includes("3 of 8 cards done — 5 cards to go."))
    assert.ok(email.text.includes("Current streak: 5 days."))
    assert.ok(email.html.includes('href="https://concord.test/today"'))
    assert.ok(email.html.includes("Unsubscribe from emails"))
    assert.ok(email.text.includes(LINKS.unsubscribeUrl))
  })

  it("daily reminder with nothing due", () => {
    const email = renderDailyReminder({ streak: 0, cardsDue: 0, cardsDoneToday: 0, goal: null }, LINKS)
    assert.equal(email.subject, "Your daily set is ready")
    assert.ok(email.text.includes("Finish today's goal to start a streak."))
  })

  it("streak at risk mentions freezes", () => {
    const withFreeze = renderStreakAtRisk({ streak: 9, freezes: 1, cardsDoneToday: 0, goal: 8 }, LINKS)
    assert.equal(withFreeze.subject, "Keep your 9-day streak")
    assert.ok(withFreeze.text.includes("1 streak freeze banked"))
    const noFreeze = renderStreakAtRisk({ streak: 3, freezes: 0, cardsDoneToday: 2, goal: 8 }, { ...LINKS, unsubscribeUrl: null })
    assert.ok(noFreeze.text.includes("No freezes banked"))
    assert.ok(!noFreeze.html.includes("Unsubscribe"))
  })

  it("weekly recap lists firms with deltas and escapes firm names", () => {
    const email = renderWeeklyRecap(
      {
        streak: 4,
        xpWeek: 210,
        daysGoalMet: 3,
        firms: [
          { name: "Goldman <Sachs>", readiness: 0.624, delta: -0.031 },
          { name: "Evercore", readiness: 0.4, delta: null },
        ],
        weakestTopic: { label: "Accounting", score: 0.3 },
        nextMock: { firmName: "Evercore" },
      },
      LINKS,
    )
    assert.equal(email.subject, "Your week: Goldman <Sachs> readiness 62% (-3)")
    const newFirst = renderWeeklyRecap(
      {
        streak: 1,
        xpWeek: 10,
        daysGoalMet: 1,
        firms: [
          { name: "Evercore", readiness: 0.4, delta: null },
          { name: "Lazard", readiness: 0.5, delta: 0.1 },
        ],
        weakestTopic: null,
        nextMock: { firmName: "Evercore" },
      },
      LINKS,
    )
    assert.equal(newFirst.subject, "Your week: Lazard readiness 50% (+10)", "subject uses a firm with a delta")
    assert.ok(newFirst.text.includes("run the Evercore mock"))
    assert.ok(email.html.includes("Goldman &lt;Sachs&gt;"))
    assert.ok(!email.html.includes("Goldman <Sachs>"))
    assert.ok(email.text.includes("- Evercore: 40% (new)"))
    assert.ok(email.text.includes("Weakest topic: Accounting (30% mastery)"))
    assert.ok(email.html.includes("https://concord.test/simulator"))
  })

  it("weekly recap degrades with no data", () => {
    const email = renderWeeklyRecap(
      { streak: 0, xpWeek: 0, daysGoalMet: 0, firms: [], weakestTopic: null, nextMock: null },
      LINKS,
    )
    assert.equal(email.subject, "Your week in Concord")
    assert.ok(email.text.includes("one full mock"))
    assert.ok(email.html.includes("https://concord.test/progress"))
  })

  it("push payloads open /today", () => {
    const risk = renderPush("streak_at_risk", { streak: 7, cardsDoneToday: 5, goal: 8 })
    assert.deepEqual(risk, { title: "Keep your 7-day streak", body: "3 cards left today.", url: "/today", tag: "concord-streak" })
    const daily = renderPush("daily_reminder", { streak: 0, cardsDue: 0, cardsDoneToday: 0, goal: null })
    assert.equal(daily.title, "Your daily set is ready")
  })
})
