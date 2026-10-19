/**
 * Opt-in Postgres integration test for the retention engine (daily set,
 * activity, streak rollover, readiness snapshots, achievements) under RLS.
 *
 * Skipped unless RETENTION_DB_TEST_URL (a DSN for a scratch DB with migrations
 * through 054, connecting as the non-owner concord_app role) and
 * RETENTION_DB_SHIM (the scripts/dev/neon_http_shim.py endpoint) are set:
 *
 *   python3 scripts/dev/neon_http_shim.py --port 4471
 *   RETENTION_DB_SHIM=http://127.0.0.1:4471/sql \
 *   RETENTION_DB_TEST_URL=postgresql://concord_app@localhost:55432/concord_retention \
 *   npx tsx --test lib/data/retention.db.test.ts
 *
 * Needs ≥ 1 published question (published.v_questions). Never point at Neon.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- opt-in local test, never a build input */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const DSN = process.env.RETENTION_DB_TEST_URL
const SHIM = process.env.RETENTION_DB_SHIM
const enabled = Boolean(DSN && SHIM)

describe("retention engine on Postgres (opt-in)", { skip: !enabled }, () => {
  it("builds one set per local day, records activity, streak and achievements", async () => {
    const { neonConfig } = await import("@neondatabase/serverless")
    neonConfig.fetchEndpoint = SHIM as string
    process.env.DATABASE_URL = DSN
    const { resetDbClients } = await import("@ibpe/database")
    resetDbClients()

    const { putPrepProfile } = await import("./profile")
    const { getOrCreateDailySet, readDailySet } = await import("./daily-set")
    const { recordLearningActivity, getRetentionState, listAchievements } = await import("./activity")
    const { getFirmReadiness } = await import("./readiness")

    const userId = `retention_db_${Date.now()}`
    await putPrepProfile({
      userId,
      input: { timezone: "America/New_York", availability_minutes: 7, reminder_hour: 20 },
    })
    // A later partial PUT must not wipe timezone / reminder (jsonb merge).
    const merged = await putPrepProfile({ userId, input: { track: "PE" } })
    assert.equal(merged.profile.timezone, "America/New_York")
    assert.equal(merged.profile.reminder_hour, 20)

    // 02:00Z on the 24th is 22:00 on the 23rd in New York.
    const day1 = new Date("2026-09-24T02:00:00Z")
    const first = await getOrCreateDailySet({ userId, now: day1 })
    assert.equal(first.source, "published")
    assert.equal(first.set.local_date, "2026-09-23")
    assert.ok(first.set.items.length > 0, "needs published questions")
    const again = await getOrCreateDailySet({ userId, now: new Date("2026-09-23T15:00:00Z") })
    assert.deepEqual(
      again.set.items.map((item) => item.id),
      first.set.items.map((item) => item.id),
    )

    const goal = first.set.goal
    let last = null
    for (const [index, item] of first.set.items.entries()) {
      last = await recordLearningActivity({
        userId,
        kind: "attempt",
        subjectId: item.subject_id,
        score: 0.9,
        scoreSource: "llm",
        countsTowardGoal: true,
        at: new Date(day1.getTime() + index * 1000),
      })
      assert.ok(last, "activity recorded")
    }
    assert.equal(last?.streak?.current, 1)
    assert.equal(last?.streak?.goal_met_today, true)
    assert.deepEqual(last?.daily_set, { completed: first.set.items.length, goal })
    const stored = await readDailySet(userId, "2026-09-23")
    assert.ok(stored?.set.completed_at)
    assert.ok(stored?.set.items.every((item) => item.done_at))

    // Same subject again within 24 h → half XP, no double goal bonus.
    const repeat = await recordLearningActivity({
      userId,
      kind: "attempt",
      subjectId: first.set.items[0]!.subject_id,
      score: 1,
      scoreSource: "llm",
      countsTowardGoal: true,
      at: new Date(day1.getTime() + 60_000),
    })
    assert.equal(repeat?.xp_awarded, 5)
    assert.equal(repeat?.xp_total, (last?.xp_total ?? 0) + 5)

    // Next local day: goal met again → streak 2.
    const day2 = new Date("2026-09-24T20:00:00Z")
    const set2 = await getOrCreateDailySet({ userId, now: day2 })
    assert.equal(set2.set.local_date, "2026-09-24")
    let day2Result = null
    for (let i = 0; i < set2.set.goal; i++) {
      day2Result = await recordLearningActivity({
        userId,
        kind: "attempt",
        subjectId: `free_${i}`,
        score: 0.8,
        scoreSource: "deterministic",
        countsTowardGoal: true,
        at: new Date(day2.getTime() + i * 1000),
      })
    }
    assert.equal(day2Result?.streak?.current, 2)

    // Skip the 25th and 26th: no freeze banked → streak ends on the 27th.
    const lapsed = await getRetentionState({ userId, now: new Date("2026-09-27T15:00:00Z") })
    assert.equal(lapsed.streak.current, 0)
    assert.equal(lapsed.streak.longest, 2)

    const achievements = await listAchievements(userId)
    assert.equal(achievements.source, "published")
    assert.ok(achievements.items.some((a) => a.id === "graded_10"))

    const readiness = await getFirmReadiness({
      userId,
      firmIds: ["firm_goldman-sachs"],
      today: "2026-09-27",
    })
    assert.equal(readiness.length, 1)

    const { getToday } = await import("./today")
    const today = await getToday({ userId, firmIds: ["firm_goldman-sachs"], now: new Date("2026-09-27T15:00:00Z") })
    assert.equal(today.source, "published")
    assert.equal(today.local_date, "2026-09-27")
    assert.equal(today.streak.current, 0)
    assert.equal(today.warren.state, "returning")

    const { getPlacementQuestions, completePlacement } = await import("./placement")
    const placement = await getPlacementQuestions(userId)
    assert.equal(placement.source, "published")
    assert.ok(placement.questions.length > 0)
    await completePlacement({ userId })
    const { getPrepProfile } = await import("./profile")
    const after = await getPrepProfile(userId)
    assert.ok(after.profile.placement_completed_at)
    assert.equal(after.profile.timezone, "America/New_York")
  })

  it("earns a freeze after 7 goal days and spends it on a single missed day", async () => {
    const { putPrepProfile } = await import("./profile")
    const { recordLearningActivity, getRetentionState } = await import("./activity")
    const { requireSql } = await import("@/lib/db/client")
    const { withRlsUserId } = await import("@/lib/db/rls")

    const userId = `retention_db_freeze_${Date.now()}`
    await putPrepProfile({ userId, input: { timezone: "UTC", availability_minutes: 1 } }) // goal 5
    const meetGoal = async (day: string) => {
      let result = null
      for (let i = 0; i < 5; i++) {
        result = await recordLearningActivity({
          userId,
          kind: "attempt",
          subjectId: `${day}_${i}`,
          score: 0.7,
          scoreSource: "deterministic",
          countsTowardGoal: true,
          at: new Date(`${day}T09:0${i}:00Z`),
        })
      }
      return result
    }
    for (let d = 1; d <= 7; d++) await meetGoal(`2026-10-0${d}`)
    const week = await getRetentionState({ userId, now: new Date("2026-10-07T20:00:00Z") })
    assert.equal(week.streak.current, 7)
    assert.equal(week.streak.freezes, 1)

    const back = await getRetentionState({ userId, now: new Date("2026-10-09T08:00:00Z") })
    assert.deepEqual(back.rollover.freeze_dates, ["2026-10-08"])
    assert.equal(back.streak.freezes, 0)
    const day9 = await meetGoal("2026-10-09")
    assert.equal(day9?.streak?.current, 8)
    assert.equal(day9?.streak?.freezes, 0)

    const rows = await withRlsUserId(requireSql(), userId, (s) => [
      s`
        SELECT da.local_date::text AS d, da.freeze_used, da.goal_met
        FROM app.daily_activity da JOIN app.users u ON u.id = da.user_id
        WHERE u.neon_auth_user_id = ${userId} AND da.local_date = '2026-10-08'
      `,
    ])
    assert.deepEqual((rows[0] as unknown[])[0], { d: "2026-10-08", freeze_used: true, goal_met: false })
  })
})
