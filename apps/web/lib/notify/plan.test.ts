import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  inWindow,
  liveStreak,
  planForUser,
  planNotifications,
  type PlannerOptions,
  type PlannerUser,
} from "./plan"
import { addDays, localParts, mondayOf } from "./time"

const BOTH = { email: true, push: true }

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

function at(iso: string, extra: Partial<PlannerOptions> = {}): PlannerOptions {
  return { now: new Date(iso), channels: BOTH, ...extra }
}

function kinds(u: PlannerUser, opts: PlannerOptions): string[] {
  return planForUser(u, opts).planned.map((p) => `${p.kind}:${p.channel}`)
}

describe("time helpers", () => {
  it("computes local parts across zones", () => {
    const now = new Date("2026-09-23T03:30:00Z")
    assert.deepEqual(
      { ...localParts(now, "America/Los_Angeles") },
      {
        timeZone: "America/Los_Angeles",
        localDate: "2026-09-22",
        hour: 20,
        minute: 30,
        weekday: 2,
      },
    )
    assert.equal(localParts(now, "Asia/Kolkata").hour, 9)
    assert.equal(localParts(now, "Asia/Kolkata").minute, 0)
    assert.equal(localParts(new Date("2026-09-23T00:00:00Z"), "UTC").hour, 0)
  })

  it("falls back to UTC for invalid or missing zones", () => {
    const now = new Date("2026-09-23T10:00:00Z")
    assert.equal(localParts(now, "Mars/Olympus").timeZone, "UTC")
    assert.equal(localParts(now, null).hour, 10)
  })

  it("does date arithmetic without DST drift", () => {
    assert.equal(addDays("2026-03-08", 1), "2026-03-09")
    assert.equal(addDays("2026-03-01", -1), "2026-02-28")
    assert.equal(addDays("2028-02-28", 1), "2028-02-29")
    assert.equal(mondayOf("2026-09-23"), "2026-09-21")
    assert.equal(mondayOf("2026-09-21"), "2026-09-21")
    assert.equal(mondayOf("2026-09-27"), "2026-09-21")
  })

  it("windows never wrap past midnight", () => {
    assert.ok(inWindow(23, 23, 2))
    assert.ok(!inWindow(0, 23, 2))
    assert.ok(inWindow(10, 9, 2))
    assert.ok(!inWindow(11, 9, 2))
    assert.ok(inWindow(9, 9, 0), "grace below 1 still gives the exact hour")
  })
})

describe("daily_reminder", () => {
  it("fires at the local reminder hour when the goal is unmet", () => {
    assert.deepEqual(kinds(user(), at("2026-09-23T09:00:00Z")), ["daily_reminder:email"])
  })

  it("does not fire before the hour or after the grace window", () => {
    assert.deepEqual(kinds(user(), at("2026-09-23T08:59:00Z")), [])
    assert.deepEqual(kinds(user(), at("2026-09-23T10:30:00Z")), ["daily_reminder:email"])
    assert.deepEqual(kinds(user(), at("2026-09-23T11:00:00Z")), [])
  })

  it("does not fire when the goal is already met today", () => {
    const u = user({
      activity: [
        { localDate: "2026-09-23", goalMet: true, freezeUsed: false, cardsDone: 8, goal: 8 },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T09:00:00Z")), [])
    const viaStreak = user({ streak: { current: 4, lastGoalDate: "2026-09-23", freezes: 0 } })
    assert.deepEqual(kinds(viaStreak, at("2026-09-23T09:00:00Z")), [])
  })

  it("uses yesterday's met goal only for yesterday", () => {
    const u = user({
      activity: [
        { localDate: "2026-09-22", goalMet: true, freezeUsed: false, cardsDone: 8, goal: 8 },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T09:00:00Z")), ["daily_reminder:email"])
  })

  it("is off when reminder_hour is null", () => {
    assert.deepEqual(kinds(user({ reminderHour: null }), at("2026-09-23T09:00:00Z")), [])
  })

  it("respects the user's timezone (EDT)", () => {
    const u = user({ timezone: "America/New_York" })
    assert.deepEqual(kinds(u, at("2026-09-23T12:00:00Z")), [])
    const plan = planForUser(u, at("2026-09-23T13:00:00Z"))
    assert.equal(plan.planned.length, 1)
    assert.equal(plan.planned[0]?.localDate, "2026-09-23")
    assert.equal(plan.planned[0]?.context.localHour, 9)
  })

  it("uses the local date, not the UTC date, for idempotency", () => {
    // 01:00Z on the 24th is 21:00 on the 23rd in New York.
    const u = user({ timezone: "America/New_York", reminderHour: 21 })
    const plan = planForUser(u, at("2026-09-24T01:00:00Z"))
    assert.equal(plan.planned[0]?.localDate, "2026-09-23")
  })

  it("handles half-hour offsets (Asia/Kolkata)", () => {
    const u = user({ timezone: "Asia/Kolkata", reminderHour: 9 })
    // Hourly cron at :00 UTC lands on :30 local.
    assert.deepEqual(kinds(u, at("2026-09-23T03:00:00Z")), []) // 08:30
    assert.deepEqual(kinds(u, at("2026-09-23T04:00:00Z")), ["daily_reminder:email"]) // 09:30
  })

  it("still delivers on a DST spring-forward day when the hour does not exist", () => {
    // 2026-03-08 America/New_York: 02:00 EST jumps to 03:00 EDT.
    const u = user({ timezone: "America/New_York", reminderHour: 2 })
    assert.deepEqual(kinds(u, at("2026-03-08T06:00:00Z")), []) // 01:00 EST
    const plan = planForUser(u, at("2026-03-08T07:00:00Z")) // 03:00 EDT
    assert.equal(plan.planned.length, 1)
    assert.equal(plan.planned[0]?.context.localHour, 3)
    assert.equal(plan.planned[0]?.localDate, "2026-03-08")
  })

  it("sends once on a DST fall-back day when the hour repeats", () => {
    // 2026-11-01 America/New_York: 01:00 EDT (05:00Z) then 01:00 EST (06:00Z).
    const u = user({ timezone: "America/New_York", reminderHour: 1 })
    const first = planForUser(u, at("2026-11-01T05:00:00Z"))
    assert.equal(first.planned.length, 1)
    assert.equal(first.planned[0]?.localDate, "2026-11-01")
    const afterSend = user({
      ...u,
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-11-01", status: "sent" },
      ],
    })
    assert.equal(planForUser(afterSend, at("2026-11-01T06:00:00Z")).local.hour, 1)
    assert.deepEqual(kinds(afterSend, at("2026-11-01T06:00:00Z")), [])
  })

  it("keeps a fixed local hour across the DST change (UTC hour shifts)", () => {
    const u = user({ timezone: "Europe/London", reminderHour: 8 })
    // BST (UTC+1) in September, GMT in December.
    assert.deepEqual(kinds(u, at("2026-09-23T07:00:00Z")), ["daily_reminder:email"])
    assert.deepEqual(kinds(u, at("2026-12-02T07:00:00Z")), [])
    assert.deepEqual(kinds(u, at("2026-12-02T08:00:00Z")), ["daily_reminder:email"])
  })
})

describe("channels", () => {
  it("plans push only with a subscription and the pref on", () => {
    assert.deepEqual(
      kinds(user({ notifyPush: true }), at("2026-09-23T09:00:00Z")),
      ["daily_reminder:email"],
    )
    assert.deepEqual(
      kinds(user({ notifyPush: true, hasPushSubscription: true }), at("2026-09-23T09:00:00Z")),
      ["daily_reminder:email", "daily_reminder:push"],
    )
  })

  it("skips email without an address or with notify_email off", () => {
    assert.deepEqual(kinds(user({ email: null }), at("2026-09-23T09:00:00Z")), [])
    assert.deepEqual(kinds(user({ notifyEmail: false }), at("2026-09-23T09:00:00Z")), [])
  })

  it("never plans a channel whose provider is not configured", () => {
    const u = user({ notifyPush: true, hasPushSubscription: true })
    assert.deepEqual(
      kinds(u, at("2026-09-23T09:00:00Z", { channels: { email: false, push: true } })),
      ["daily_reminder:push"],
    )
    assert.deepEqual(
      kinds(u, at("2026-09-23T09:00:00Z", { channels: { email: false, push: false } })),
      [],
    )
  })

  it("pause all silences everything", () => {
    const plan = planForUser(user({ paused: true }), at("2026-09-23T09:00:00Z"))
    assert.deepEqual(plan.planned, [])
    assert.deepEqual(plan.notes, ["paused"])
  })
})

describe("streak_at_risk", () => {
  const streaky = (current: number, lastGoalDate: string | null, freezes = 0) =>
    user({ reminderHour: null, streak: { current, lastGoalDate, freezes } })

  it("fires at 20:00 local for a live streak of 3+ with the goal unmet", () => {
    assert.deepEqual(kinds(streaky(3, "2026-09-22"), at("2026-09-23T20:00:00Z")), [
      "streak_at_risk:email",
    ])
    assert.deepEqual(kinds(streaky(3, "2026-09-22"), at("2026-09-23T19:00:00Z")), [])
  })

  it("does not fire for short streaks", () => {
    assert.deepEqual(kinds(streaky(2, "2026-09-22"), at("2026-09-23T20:00:00Z")), [])
  })

  it("does not fire once the goal is met", () => {
    assert.deepEqual(kinds(streaky(6, "2026-09-23"), at("2026-09-23T20:00:00Z")), [])
  })

  it("treats a stale streak counter as broken", () => {
    assert.equal(liveStreak(streaky(9, "2026-09-20"), "2026-09-23"), 0)
    assert.deepEqual(kinds(streaky(9, "2026-09-20"), at("2026-09-23T20:00:00Z")), [])
  })

  it("keeps a streak alive over one missed day when a freeze is banked", () => {
    assert.equal(liveStreak(streaky(9, "2026-09-21", 1), "2026-09-23"), 9)
    assert.equal(liveStreak(streaky(9, "2026-09-21", 0), "2026-09-23"), 0)
  })

  it("keeps a streak alive over days already covered by freezes", () => {
    const u = user({
      streak: { current: 7, lastGoalDate: "2026-09-20", freezes: 0 },
      activity: [
        { localDate: "2026-09-21", goalMet: false, freezeUsed: true, cardsDone: 0, goal: 8 },
        { localDate: "2026-09-22", goalMet: false, freezeUsed: true, cardsDone: 0, goal: 8 },
      ],
    })
    assert.equal(liveStreak(u, "2026-09-23"), 7)
  })

  it("supersedes the daily reminder at the same hour", () => {
    const u = user({ reminderHour: 20, streak: { current: 5, lastGoalDate: "2026-09-22", freezes: 0 } })
    const plan = planForUser(u, at("2026-09-23T20:00:00Z"))
    assert.deepEqual(plan.planned.map((p) => p.kind), ["streak_at_risk"])
    assert.ok(plan.notes.some((n) => n.includes("superseded")))
  })

  it("suppresses a later daily reminder once the at-risk nudge went out", () => {
    const u = user({
      reminderHour: 21,
      streak: { current: 5, lastGoalDate: "2026-09-22", freezes: 0 },
      log: [
        { kind: "streak_at_risk", channel: "email", localDate: "2026-09-23", status: "sent" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T21:00:00Z")), [])
  })

  it("carries streak context for templates", () => {
    const u = user({
      reminderHour: null,
      streak: { current: 12, lastGoalDate: "2026-09-22", freezes: 2 },
      activity: [
        { localDate: "2026-09-23", goalMet: false, freezeUsed: false, cardsDone: 3, goal: 8 },
      ],
    })
    const [planned] = planForUser(u, at("2026-09-23T20:15:00Z")).planned
    assert.deepEqual(planned?.context, {
      localHour: 20,
      streak: 12,
      freezes: 2,
      goalMetToday: false,
      cardsDoneToday: 3,
      goalToday: 8,
    })
  })
})

describe("weekly_recap", () => {
  const recap = (overrides: Partial<PlannerUser> = {}) =>
    user({ reminderHour: null, weeklyRecap: true, notifyPush: true, hasPushSubscription: true, ...overrides })

  it("fires Sunday 18:00 local by email only", () => {
    // 2026-09-27 is a Sunday.
    assert.deepEqual(kinds(recap(), at("2026-09-27T18:00:00Z")), ["weekly_recap:email"])
  })

  it("does not fire on other days or hours, or when toggled off", () => {
    assert.deepEqual(kinds(recap(), at("2026-09-26T18:00:00Z")), [])
    assert.deepEqual(kinds(recap(), at("2026-09-27T17:00:00Z")), [])
    assert.deepEqual(kinds(recap({ weeklyRecap: false }), at("2026-09-27T18:00:00Z")), [])
  })

  it("uses the local weekday (Sunday in Tokyo is Sunday morning UTC)", () => {
    const u = recap({ timezone: "Asia/Tokyo" })
    assert.deepEqual(kinds(u, at("2026-09-27T09:00:00Z")), ["weekly_recap:email"]) // 18:00 JST
    assert.deepEqual(kinds(u, at("2026-09-27T18:00:00Z")), []) // Monday 03:00 JST
  })

  it("fires even when the daily goal is met", () => {
    const u = recap({
      activity: [
        { localDate: "2026-09-27", goalMet: true, freezeUsed: false, cardsDone: 8, goal: 8 },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-27T18:00:00Z")), ["weekly_recap:email"])
  })
})

describe("caps and idempotency", () => {
  it("skips a (kind, channel) already sent or skipped today", () => {
    for (const status of ["sent", "skipped"] as const) {
      const u = user({
        log: [{ kind: "daily_reminder", channel: "email", localDate: "2026-09-23", status }],
      })
      assert.deepEqual(kinds(u, at("2026-09-23T09:30:00Z")), [], status)
    }
  })

  it("retries a failed send inside the window", () => {
    const u = user({
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-23", status: "failed" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T10:00:00Z")), ["daily_reminder:email"])
  })

  it("ignores yesterday's log", () => {
    const u = user({
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-22", status: "sent" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T09:00:00Z")), ["daily_reminder:email"])
  })

  it("only sends the missing channel when one channel already went out", () => {
    const u = user({
      notifyPush: true,
      hasPushSubscription: true,
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-23", status: "sent" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T09:00:00Z")), ["daily_reminder:push"])
  })

  it("does not charge the cap again for a kind already delivered on another channel", () => {
    const u = user({
      notifyPush: true,
      hasPushSubscription: true,
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-23", status: "sent" },
        { kind: "weekly_recap", channel: "email", localDate: "2026-09-23", status: "sent" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-23T09:00:00Z")), ["daily_reminder:push"])
  })

  it("caps distinct kinds per local day at 2", () => {
    // Morning reminder + recap already out; the 20:00 at-risk nudge is capped.
    const u = user({
      reminderHour: 9,
      weeklyRecap: true,
      streak: { current: 5, lastGoalDate: "2026-09-26", freezes: 0 },
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-27", status: "sent" },
        { kind: "weekly_recap", channel: "email", localDate: "2026-09-27", status: "sent" },
      ],
    })
    const plan = planForUser(u, at("2026-09-27T20:00:00Z"))
    assert.deepEqual(plan.planned, [])
    assert.ok(plan.notes.some((n) => n.includes("streak_at_risk: daily cap reached")))
    // Without the recap the nudge goes out.
    const lighter = user({ ...u, log: u.log.slice(0, 1) })
    assert.deepEqual(kinds(lighter, at("2026-09-27T20:00:00Z")), ["streak_at_risk:email"])
  })

  it("blocks a third kind when two were already delivered", () => {
    const u = user({
      reminderHour: 18,
      weeklyRecap: true,
      log: [
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-27", status: "sent" },
        { kind: "streak_at_risk", channel: "push", localDate: "2026-09-27", status: "sent" },
      ],
    })
    const plan = planForUser(u, at("2026-09-27T18:00:00Z"))
    assert.deepEqual(plan.planned, [])
    assert.ok(plan.notes.some((n) => n.includes("weekly_recap: daily cap reached")))
  })

  it("failed rows do not count toward the cap", () => {
    const u = user({
      reminderHour: 18,
      weeklyRecap: true,
      log: [
        { kind: "streak_at_risk", channel: "email", localDate: "2026-09-27", status: "failed" },
        { kind: "daily_reminder", channel: "email", localDate: "2026-09-27", status: "failed" },
      ],
    })
    assert.deepEqual(kinds(u, at("2026-09-27T18:00:00Z")), [
      "daily_reminder:email",
      "weekly_recap:email",
    ])
  })

  it("picks by priority when the cap is tight", () => {
    const u = user({ reminderHour: 18, weeklyRecap: true })
    assert.deepEqual(kinds(u, at("2026-09-27T18:00:00Z", { maxPerDay: 1 })), [
      "daily_reminder:email",
    ])
    assert.deepEqual(kinds(u, at("2026-09-27T18:00:00Z")), [
      "daily_reminder:email",
      "weekly_recap:email",
    ])
  })
})

describe("planNotifications", () => {
  it("plans across users in different zones for one run", () => {
    const now = "2026-09-23T13:00:00Z"
    const planned = planNotifications(
      [
        user({ userId: "ny", timezone: "America/New_York", reminderHour: 9 }), // 09:00
        user({ userId: "ldn", timezone: "Europe/London", reminderHour: 9 }), // 14:00
        user({ userId: "sg", timezone: "Asia/Singapore", reminderHour: 21 }), // 21:00
        user({ userId: "paused", timezone: "America/New_York", paused: true }),
      ],
      at(now),
    )
    assert.deepEqual(
      planned.map((p) => p.userId),
      ["ny", "sg"],
    )
  })
})

describe("daily cadence (one cron run a day)", () => {
  // 2026-09-27 is a Sunday. 13:00 UTC is 18:30 in Kolkata, 09:00 in New York.
  const run = (extra: Partial<PlannerOptions> = {}) =>
    at("2026-09-27T13:00:00Z", { cadence: "daily", ...extra })

  it("sends the daily reminder regardless of the chosen hour", () => {
    const u = user({ timezone: "Asia/Kolkata", reminderHour: 7 })
    assert.deepEqual(kinds(u, at("2026-09-27T13:00:00Z")), [])
    assert.deepEqual(kinds(u, run()), ["daily_reminder:email"])
  })

  it("skips reminders when off or when today's goal is already met", () => {
    assert.deepEqual(kinds(user({ reminderHour: null }), run()), [])
    const met = user({
      activity: [{ localDate: "2026-09-27", goalMet: true, freezeUsed: false, cardsDone: 8, goal: 8 }],
    })
    assert.deepEqual(kinds(met, run()), [])
  })

  it("replaces the reminder with the streak-at-risk nudge", () => {
    const u = user({ streak: { current: 5, lastGoalDate: "2026-09-26", freezes: 0 } })
    assert.deepEqual(kinds(u, run()), ["streak_at_risk:email"])
  })

  it("sends the weekly recap on the user's local Sunday only", () => {
    const u = user({ reminderHour: null, weeklyRecap: true })
    assert.deepEqual(kinds(u, run()), ["weekly_recap:email"])
    assert.deepEqual(kinds(u, at("2026-09-28T13:00:00Z", { cadence: "daily" })), [])
  })

  it("stays idempotent within the local day", () => {
    const u = user({
      log: [{ kind: "daily_reminder", channel: "email", localDate: "2026-09-27", status: "sent" }],
    })
    assert.deepEqual(kinds(u, run()), [])
  })
})

describe("notifyCadence", () => {
  it("defaults to daily and accepts hourly", async () => {
    const { notifyCadence } = await import("./plan")
    assert.equal(notifyCadence({}), "daily")
    assert.equal(notifyCadence({ NOTIFY_CADENCE: "HOURLY" }), "hourly")
    assert.equal(notifyCadence({ NOTIFY_CADENCE: "weekly" }), "daily")
  })
})
