/**
 * Opt-in Postgres integration test for league tiers (migration 063): a member
 * who topped last week's league is settled lazily on their next visit and
 * joins this week one tier up; the runner-up holds. Also checks that the
 * day-history readers behind the tally calendar work under RLS.
 *
 * Skipped unless RETENTION_DB_TEST_URL (scratch DB with migrations through
 * 063, connecting as the non-owner concord_app role) and RETENTION_DB_SHIM
 * (scripts/dev/neon_http_shim.py) are set — same harness as
 * retention.db.test.ts. Never point at Neon.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- opt-in local test, never a build input */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

const DSN = process.env.RETENTION_DB_TEST_URL
const SHIM = process.env.RETENTION_DB_SHIM
const enabled = Boolean(DSN && SHIM)

describe("league tiers on Postgres (opt-in)", { skip: !enabled }, () => {
  it("settles last week lazily and places members in their next tier", async () => {
    const { neonConfig } = await import("@neondatabase/serverless")
    neonConfig.fetchEndpoint = SHIM as string
    process.env.DATABASE_URL = DSN
    const { resetDbClients } = await import("@ibpe/database")
    resetDbClients()

    const { putPrepProfile } = await import("./profile")
    const { recordLearningActivity, readDayHistory, getStreakRun } = await import("./activity")
    const { setLeagueOptIn, getCurrentLeague } = await import("./leagues")

    const stamp = Date.now()
    const leader = `league_db_a_${stamp}`
    const second = `league_db_b_${stamp}`
    const cohort = `dbtest ${stamp}`
    const lastWeek = new Date("2026-09-23T15:00:00Z") // Wed of week starting Mon 21 Sep (UTC)
    const thisWeek = new Date("2026-10-07T15:00:00Z") // Wed of week starting Mon 5 Oct

    for (const userId of [leader, second]) {
      await putPrepProfile({ userId, input: { timezone: "UTC", availability_minutes: 7 } })
      const joined = await setLeagueOptIn({ userId, optIn: true, cohort, now: lastWeek })
      assert.equal(joined.source, "published")
      assert.equal(joined.tier?.index, 0)
    }

    // The leader earns XP last week; the runner-up doesn't.
    const activity = await recordLearningActivity({
      userId: leader,
      kind: "attempt",
      subjectId: `subject_${stamp}`,
      score: 1,
      scoreSource: "llm",
      countsTowardGoal: true,
      at: lastWeek,
    })
    assert.ok((activity?.xp_awarded ?? 0) > 0)
    assert.equal(activity?.level_up ?? null, null)

    const history = await readDayHistory(leader, "2026-09-21", "2026-09-27")
    assert.equal(history.length, 1)
    assert.ok(history[0]!.xp > 0)
    assert.ok(Array.isArray(await getStreakRun(leader, "2026-09-23")))

    const up = await getCurrentLeague({ userId: leader, now: thisWeek })
    assert.equal(up.last_week?.result, "promoted")
    assert.equal(up.last_week?.rank, 1)
    assert.equal(up.last_week?.size, 2)
    assert.equal(up.tier?.index, 1)
    assert.equal(up.tier?.name, "Middle Market")

    const held = await getCurrentLeague({ userId: second, now: thisWeek })
    assert.equal(held.last_week?.result, "held")
    assert.equal(held.tier?.index, 0)

    // Settled once: a second visit reads the stored result, not a re-rank.
    const again = await getCurrentLeague({ userId: leader, now: thisWeek })
    assert.equal(again.last_week?.result, "promoted")
    assert.equal(again.tier?.index, 1)
  })
})
