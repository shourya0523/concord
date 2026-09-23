import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  cohortKeyFor,
  groupIntoLeagues,
  handleFromSeed,
  HANDLE_PATTERN,
  LEAGUE_CAP,
  leagueHandle,
  leagueId,
  leagueWeek,
  normaliseCohort,
  pickLeague,
  promotionCopy,
  rankStandings,
  zoneCounts,
  zoneFor,
} from "./leagues"

describe("league handles", () => {
  it("are adjective-animal-### and deterministic", () => {
    const a = handleFromSeed("user_1:2026-09-21")
    assert.match(a, HANDLE_PATTERN)
    assert.equal(a, handleFromSeed("user_1:2026-09-21"))
    const [, , num] = a.split("-")
    assert.ok(Number(num) >= 100 && Number(num) <= 999)
  })

  it("never contain the email or name used as a seed", () => {
    for (const seed of ["jane.doe@gmail.com", "Jane Doe", "user_jane"]) {
      const handle = handleFromSeed(seed)
      assert.match(handle, HANDLE_PATTERN)
      assert.ok(!handle.includes("jane"))
      assert.ok(!handle.includes("@"))
    }
  })

  it("rotate weekly and spread across the space", () => {
    assert.notEqual(leagueHandle("u1", "2026-09-21"), leagueHandle("u1", "2026-09-28"))
    const handles = new Set(Array.from({ length: 500 }, (_, i) => leagueHandle(`user_${i}`, "2026-09-21")))
    assert.ok(handles.size >= 495, `expected few collisions, got ${500 - handles.size}`)
  })
})

describe("cohorts", () => {
  it("normalises free text", () => {
    assert.equal(normaliseCohort("  2027   SA  "), "2027 SA")
    assert.equal(normaliseCohort(""), null)
    assert.equal(normaliseCohort("   "), null)
    assert.equal(normaliseCohort(null), null)
    assert.equal(normaliseCohort("<script>x</script>"), "script x /script")
    assert.equal(normaliseCohort("a".repeat(100))?.length, 40)
  })

  it("groups by cohort case/spacing-insensitively, else by track", () => {
    assert.equal(cohortKeyFor("2027 SA", "IB").key, cohortKeyFor(" 2027  sa", "PE").key)
    assert.equal(cohortKeyFor("2027 SA", "IB").label, "2027 SA")
    assert.deepEqual(cohortKeyFor(null, "IB"), { key: "track-ib", label: "IB track" })
    assert.deepEqual(cohortKeyFor("", "Both"), { key: "track-both", label: "IB + PE track" })
    assert.deepEqual(cohortKeyFor(null, null), { key: "track-all", label: "All tracks" })
  })
})

describe("league placement", () => {
  const week = "2026-09-21"

  it("opens league 1 for the first member", () => {
    assert.equal(pickLeague([], week, "track-ib"), leagueId(week, "track-ib", 1))
  })

  it("fills the lowest league with room and opens the next when full", () => {
    const sizes = [
      { league_id: leagueId(week, "track-ib", 1), members: LEAGUE_CAP },
      { league_id: leagueId(week, "track-ib", 2), members: 12 },
    ]
    assert.equal(pickLeague(sizes, week, "track-ib"), leagueId(week, "track-ib", 2))
    const full = sizes.map((s) => ({ ...s, members: LEAGUE_CAP }))
    assert.equal(pickLeague(full, week, "track-ib"), leagueId(week, "track-ib", 3))
  })

  it("reuses a gap left by leavers before opening a new league", () => {
    const sizes = [
      { league_id: leagueId(week, "track-ib", 1), members: 29 },
      { league_id: leagueId(week, "track-ib", 2), members: 30 },
    ]
    assert.equal(pickLeague(sizes, week, "track-ib"), leagueId(week, "track-ib", 1))
  })

  it("ignores other cohorts, other weeks and prefix look-alikes", () => {
    const sizes = [
      { league_id: leagueId(week, "track-pe", 1), members: 3 },
      { league_id: leagueId("2026-09-14", "track-ib", 1), members: 3 },
      { league_id: leagueId(week, "track-ib-x", 1), members: 3 },
    ]
    assert.equal(pickLeague(sizes, week, "track-ib"), leagueId(week, "track-ib", 1))
  })

  it("orders leagues numerically (10 after 9)", () => {
    const sizes = Array.from({ length: 10 }, (_, i) => ({
      league_id: leagueId(week, "track-ib", i + 1),
      members: LEAGUE_CAP,
    }))
    assert.equal(pickLeague(sizes, week, "track-ib"), leagueId(week, "track-ib", 11))
  })

  it("batch grouping keeps every league ≤ cap and separates cohorts", () => {
    const members = [
      ...Array.from({ length: 65 }, (_, i) => ({ userId: `ib_${String(i).padStart(3, "0")}`, cohortKey: "track-ib" })),
      ...Array.from({ length: 5 }, (_, i) => ({ userId: `sa_${i}`, cohortKey: "cohort-2027-sa" })),
    ]
    const groups = groupIntoLeagues(members, week)
    const sizes = [...groups.values()].map((ids) => ids.length)
    assert.ok(sizes.every((n) => n <= LEAGUE_CAP))
    assert.equal(sizes.reduce((a, b) => a + b, 0), 70)
    assert.deepEqual(
      [...groups.keys()].sort(),
      [
        leagueId(week, "cohort-2027-sa", 1),
        leagueId(week, "track-ib", 1),
        leagueId(week, "track-ib", 2),
        leagueId(week, "track-ib", 3),
      ].sort(),
    )
    assert.equal(groups.get(leagueId(week, "track-ib", 3))?.length, 5)
    assert.ok(groups.get(leagueId(week, "cohort-2027-sa", 1))!.every((id) => id.startsWith("sa_")))
  })

  it("respects a custom cap", () => {
    const groups = groupIntoLeagues(
      Array.from({ length: 7 }, (_, i) => ({ userId: `u${i}`, cohortKey: "k" })),
      week,
      3,
    )
    assert.deepEqual([...groups.values()].map((g) => g.length), [3, 3, 1])
  })
})

describe("league weeks", () => {
  it("starts Monday in the member's local zone", () => {
    // Sunday 23:30 in New York is already Monday in UTC.
    const now = new Date("2026-09-28T03:30:00Z")
    assert.equal(leagueWeek(now, "America/New_York").weekStart, "2026-09-21")
    assert.equal(leagueWeek(now, "UTC").weekStart, "2026-09-28")
    assert.equal(leagueWeek(now, "UTC").weekEnd, "2026-10-04")
  })
})

describe("standings", () => {
  it("ranks by XP with shared ranks for ties", () => {
    const standings = rankStandings([
      { handle: "b-owl-100", xp: 50, isYou: false },
      { handle: "a-fox-100", xp: 80, isYou: true },
      { handle: "c-yak-100", xp: 50, isYou: false },
      { handle: "d-elk-100", xp: 10, isYou: false },
    ])
    assert.deepEqual(
      standings.map((s) => [s.rank, s.handle]),
      [
        [1, "a-fox-100"],
        [2, "b-owl-100"],
        [2, "c-yak-100"],
        [4, "d-elk-100"],
      ],
    )
    assert.equal(standings[0]?.is_you, true)
  })

  it("assigns promotion/demotion zones by league size", () => {
    assert.deepEqual(zoneCounts(1), { promote: 0, demote: 0 })
    assert.deepEqual(zoneCounts(2), { promote: 1, demote: 0 })
    assert.deepEqual(zoneCounts(4), { promote: 1, demote: 0 })
    assert.deepEqual(zoneCounts(10), { promote: 2, demote: 2 })
    assert.deepEqual(zoneCounts(30), { promote: 6, demote: 6 })
    assert.equal(zoneFor(1, 10), "promotion")
    assert.equal(zoneFor(5, 10), "safe")
    assert.equal(zoneFor(9, 10), "demotion")
    assert.equal(zoneFor(4, 4), "safe")
  })

  it("writes promotion copy for each zone", () => {
    const [top, , , , , , , , , bottom] = rankStandings(
      Array.from({ length: 10 }, (_, i) => ({ handle: `h-${i}-100`, xp: 100 - i, isYou: false })),
    )
    assert.match(promotionCopy(top!, 10, 3), /3 days left\. You're in the top 2/)
    assert.match(promotionCopy(bottom!, 10, 1), /1 day left\. You're in the bottom group/)
    assert.match(promotionCopy(top!, 1, 0), /Final day\. You're the first/)
    assert.match(promotionCopy(null, 0, 3), /Join/)
    const pair = rankStandings([
      { handle: "a-fox-100", xp: 9, isYou: true },
      { handle: "b-owl-100", xp: 3, isYou: false },
    ])
    assert.match(promotionCopy(pair[0]!, 2, 2), /You're top of the league/)
    assert.match(promotionCopy(pair[1]!, 2, 2), /The leader moves up next week/)
    const ten = rankStandings(
      Array.from({ length: 10 }, (_, i) => ({ handle: `h-${i}-100`, xp: 100 - i, isYou: false })),
    )
    assert.match(promotionCopy(ten[4]!, 10, 2), /The top 2 move up next week/)
  })
})
