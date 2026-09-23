import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { EmailMessage, EmailSender, EmailSendResult } from "./email"
import type { LogStatus, PlannedNotification, PlannerUser } from "./plan"
import type { PushSender, PushSendResult, PushSubscriptionRecord } from "./push"
import { runNotify, type NotifyStore } from "./run"
import { verifyUnsubscribeToken } from "./token"

type LogRow = {
  id: string
  userId: string
  kind: PlannedNotification["kind"]
  channel: PlannedNotification["channel"]
  localDate: string
  status: LogStatus
  detail: Record<string, unknown>
}

/** In-memory NotifyStore with the same unique-key claim semantics as SQL. */
class MemoryStore implements NotifyStore {
  log: LogRow[] = []
  subs = new Map<string, PushSubscriptionRecord[]>()
  deleted: string[] = []
  private seq = 0
  constructor(public users: PlannerUser[]) {}

  async listCandidates({ afterUserId, limit }: { afterUserId: string | null; limit: number }) {
    return this.users
      .filter((u) => afterUserId === null || u.userId > afterUserId)
      .filter((u) => !u.paused && (u.notifyEmail || u.notifyPush))
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .slice(0, limit)
      .map((u) => ({
        ...u,
        hasPushSubscription: (this.subs.get(u.userId) ?? []).length > 0,
        log: this.log
          .filter((row) => row.userId === u.userId)
          .map(({ kind, channel, localDate, status }) => ({ kind, channel, localDate, status })),
      }))
  }

  async claim(p: PlannedNotification) {
    const existing = this.log.find(
      (row) =>
        row.userId === p.userId &&
        row.kind === p.kind &&
        row.channel === p.channel &&
        row.localDate === p.localDate,
    )
    if (existing) {
      if (existing.status !== "failed") return null
      existing.status = "sent"
      return existing.id
    }
    const id = `ntf_${++this.seq}`
    this.log.push({ id, userId: p.userId, kind: p.kind, channel: p.channel, localDate: p.localDate, status: "sent", detail: {} })
    return id
  }

  async finish(id: string, status: LogStatus, detail: Record<string, unknown>) {
    const row = this.log.find((r) => r.id === id)!
    row.status = status
    row.detail = detail
  }

  async dueCardCount() {
    return 4
  }

  async weeklyRecap() {
    return {
      xpWeek: 320,
      daysGoalMet: 5,
      firms: [{ name: "Goldman Sachs", readiness: 0.62, delta: 0.07 }],
      weakestTopic: { label: "LBO", score: 0.41 },
      nextMock: { firmName: "Goldman Sachs" },
    }
  }

  async pushSubscriptions(userId: string) {
    return this.subs.get(userId) ?? []
  }

  async deletePushSubscription(endpoint: string) {
    this.deleted.push(endpoint)
    for (const [userId, list] of this.subs) {
      this.subs.set(userId, list.filter((s) => s.endpoint !== endpoint))
    }
  }
}

class FakeEmail implements EmailSender {
  readonly provider = "fake"
  sent: EmailMessage[] = []
  constructor(public configured = true, private next: () => EmailSendResult = () => ({ status: "sent", provider: "fake", id: "em_1" })) {}
  async send(message: EmailMessage) {
    this.sent.push(message)
    return this.next()
  }
}

class FakePush implements PushSender {
  sent: string[] = []
  constructor(public configured = true, private byEndpoint: Record<string, PushSendResult["status"]> = {}) {}
  async send(sub: PushSubscriptionRecord): Promise<PushSendResult> {
    this.sent.push(sub.endpoint)
    const status = this.byEndpoint[sub.endpoint] ?? "sent"
    if (status === "gone") return { status: "gone", httpStatus: 410 }
    if (status === "failed") return { status: "failed", error: "boom", httpStatus: 500 }
    if (status === "skipped") return { status: "skipped", reason: "off" }
    return { status: "sent", httpStatus: 201 }
  }
}

function user(overrides: Partial<PlannerUser> = {}): PlannerUser {
  return {
    userId: "u1",
    email: "a@example.com",
    timezone: "UTC",
    reminderHour: 9,
    notifyEmail: true,
    notifyPush: false,
    weeklyRecap: false,
    paused: false,
    hasPushSubscription: false,
    streak: null,
    activity: [],
    log: [],
    ...overrides,
  }
}

const NOW = new Date("2026-09-23T09:00:00Z")
const SECRET = "s3cret"

function opts(store: MemoryStore, email = new FakeEmail(), push = new FakePush(), now = NOW) {
  return { store, email, push, now, appUrl: "https://concord.test", signingSecret: SECRET }
}

describe("runNotify", () => {
  it("claims first, sends, then marks sent — and is idempotent on re-run", async () => {
    const store = new MemoryStore([user()])
    const email = new FakeEmail()
    const first = await runNotify(opts(store, email))
    assert.equal(first.sent, 1)
    assert.equal(first.by_kind.daily_reminder, 1)
    assert.equal(email.sent.length, 1)
    assert.equal(store.log.length, 1)
    assert.equal(store.log[0]?.status, "sent")
    assert.equal(store.log[0]?.detail.provider_id, "em_1")

    const second = await runNotify(opts(store, email, new FakePush(), new Date("2026-09-23T10:00:00Z")))
    assert.equal(second.planned, 0)
    assert.equal(email.sent.length, 1)
  })

  it("skips when a concurrent run already claimed the row", async () => {
    const store = new MemoryStore([user()])
    // Another worker claimed it between planning and claim.
    const originalList = store.listCandidates.bind(store)
    store.listCandidates = async (page) => {
      const users = await originalList(page)
      store.log.push({ id: "other", userId: "u1", kind: "daily_reminder", channel: "email", localDate: "2026-09-23", status: "sent", detail: {} })
      return users
    }
    const email = new FakeEmail()
    const summary = await runNotify(opts(store, email))
    assert.equal(summary.planned, 1)
    assert.equal(summary.already_claimed, 1)
    assert.equal(email.sent.length, 0)
  })

  it("marks failed on provider error and retries on the next run in the window", async () => {
    const store = new MemoryStore([user()])
    let fail = true
    const email = new FakeEmail(true, () =>
      fail ? { status: "failed", provider: "fake", error: "rate limited", httpStatus: 429 } : { status: "sent", provider: "fake", id: "em_2" },
    )
    const first = await runNotify(opts(store, email))
    assert.equal(first.failed, 1)
    assert.equal(store.log[0]?.status, "failed")
    assert.equal(store.log[0]?.detail.http_status, 429)

    fail = false
    const retry = await runNotify(opts(store, email, new FakePush(), new Date("2026-09-23T09:30:00Z")))
    assert.equal(retry.sent, 1)
    assert.equal(store.log.length, 1, "retry reuses the same log row")
    assert.equal(store.log[0]?.status, "sent")
  })

  it("marks failed when rendering or the store throws", async () => {
    const store = new MemoryStore([user()])
    store.dueCardCount = async () => {
      throw new Error("db down")
    }
    const summary = await runNotify(opts(store))
    assert.equal(summary.failed, 1)
    assert.equal(store.log[0]?.detail.error, "db down")
  })

  it("includes a verifiable one-click unsubscribe link and headers", async () => {
    const store = new MemoryStore([user({ userId: "user_abc" })])
    const email = new FakeEmail()
    await runNotify(opts(store, email))
    const message = email.sent[0]!
    assert.equal(message.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click")
    const match = /token=([A-Za-z0-9_.%-]+)/.exec(message.text)
    assert.ok(match)
    const payload = verifyUnsubscribeToken(decodeURIComponent(match[1]!), SECRET)
    assert.equal(payload?.u, "user_abc")
    assert.ok(message.html.includes("https://concord.test/today"))
    assert.match(message.subject, /4 cards due today/)
  })

  it("omits the unsubscribe link when no signing secret is configured", async () => {
    const store = new MemoryStore([user()])
    const email = new FakeEmail()
    await runNotify({ ...opts(store, email), signingSecret: null })
    assert.ok(!email.sent[0]!.text.includes("Unsubscribe"))
    assert.deepEqual(email.sent[0]!.headers, {})
  })

  it("sends push to every subscription and deletes gone ones", async () => {
    const store = new MemoryStore([user({ notifyEmail: false, notifyPush: true })])
    store.subs.set("u1", [
      { endpoint: "https://push/a", p256dh: "k", auth: "a" },
      { endpoint: "https://push/gone", p256dh: "k", auth: "a" },
    ])
    const push = new FakePush(true, { "https://push/gone": "gone" })
    const summary = await runNotify(opts(store, new FakeEmail(), push))
    assert.equal(summary.sent, 1)
    assert.equal(summary.push_subscriptions_removed, 1)
    assert.deepEqual(store.deleted, ["https://push/gone"])
    assert.equal(store.log[0]?.channel, "push")
    assert.equal(store.log[0]?.detail.delivered, 1)
  })

  it("marks push skipped when every subscription is gone", async () => {
    const store = new MemoryStore([user({ notifyEmail: false, notifyPush: true })])
    store.subs.set("u1", [{ endpoint: "https://push/gone", p256dh: "k", auth: "a" }])
    const summary = await runNotify(opts(store, new FakeEmail(), new FakePush(true, { "https://push/gone": "gone" })))
    assert.equal(summary.skipped, 1)
    assert.equal(store.log[0]?.status, "skipped")
  })

  it("does nothing when no provider is configured", async () => {
    const store = new MemoryStore([user()])
    const summary = await runNotify(opts(store, new FakeEmail(false), new FakePush(false)))
    assert.equal(summary.users_scanned, 0)
    assert.equal(store.log.length, 0)
  })

  it("dry run plans without claiming or sending", async () => {
    const store = new MemoryStore([user(), user({ userId: "u2", reminderHour: 10 })])
    const email = new FakeEmail()
    const summary = await runNotify({ ...opts(store, email), dryRun: true })
    assert.equal(summary.planned, 1)
    assert.deepEqual(summary.planned_items, [
      { user_id: "u1", kind: "daily_reminder", channel: "email", local_date: "2026-09-23" },
    ])
    assert.equal(store.log.length, 0)
    assert.equal(email.sent.length, 0)
  })

  it("pages through users with keyset pagination", async () => {
    const users = Array.from({ length: 7 }, (_, i) => user({ userId: `u${i}`, email: `u${i}@x.test` }))
    const store = new MemoryStore(users)
    const email = new FakeEmail()
    const summary = await runNotify({ ...opts(store, email), batchSize: 3 })
    assert.equal(summary.users_scanned, 7)
    assert.equal(summary.sent, 7)
    assert.equal(new Set(email.sent.map((m) => m.to)).size, 7)
  })

  it("renders the weekly recap from store data", async () => {
    const store = new MemoryStore([user({ reminderHour: null, weeklyRecap: true, streak: { current: 6, lastGoalDate: "2026-09-27", freezes: 0 } })])
    const email = new FakeEmail()
    await runNotify(opts(store, email, new FakePush(), new Date("2026-09-27T18:00:00Z")))
    const message = email.sent[0]!
    assert.match(message.subject, /Goldman Sachs readiness 62% \(\+7\)/)
    assert.ok(message.text.includes("Weakest topic: LBO (41% mastery)"))
    assert.ok(message.text.includes("Goldman Sachs mock"))
    assert.ok(message.text.includes("streak 6 days"))
  })
})
