import assert from "node:assert/strict"
import test from "node:test"

import { lockedShelf, MAX_DYNAMIC_LOCKED } from "./achievement-shelf"

const base = { streak: { current: 4, longest: 4 }, graded_cards: 37, drills: 0, mocks: 0 }

test("lockedShelf reports distance left on static milestones", () => {
  const locked = lockedShelf(base, ["streak_3", "graded_10"])
  const byId = new Map(locked.map((item) => [item.id, item]))
  assert.equal(byId.has("streak_3"), false)
  assert.equal(byId.get("streak_7")?.progress_label, "3 days to go")
  assert.equal(byId.get("graded_100")?.progress_label, "63 to go")
  assert.ok(Math.abs((byId.get("graded_100")?.progress ?? 0) - 0.37) < 1e-9)
  assert.equal(byId.get("first_drill")?.progress, 0)
})

test("lockedShelf surfaces concept and next readiness level only", () => {
  const locked = lockedShelf(
    {
      ...base,
      concepts: [
        { concept_id: "lbo", topic: "LBO", attempted: 4, proficient: 3 },
        { concept_id: "dcf", topic: null, title: "DCF", attempted: 3, proficient: 3 },
        { concept_id: "unseen", topic: null, attempted: 0, proficient: 0 },
      ],
      firms: [{ firm_id: "firm_gs", firm_name: "Goldman Sachs", readiness: 0.64 }],
    },
    [],
  )
  const ids = locked.map((item) => item.id)
  assert.ok(ids.includes("concept_cleared:lbo"))
  assert.ok(!ids.includes("concept_cleared:dcf"), "already cleared → not locked")
  assert.ok(!ids.includes("concept_cleared:unseen"), "unattempted concepts stay hidden")
  assert.ok(!ids.includes("readiness_50:firm_gs"), "already past 50%")
  const gs = locked.find((item) => item.id === "readiness_80:firm_gs")
  assert.equal(gs?.progress_label, "At 64% · 16 points to go")
})

test("lockedShelf caps dynamic tombstones, nearest first", () => {
  const concepts = Array.from({ length: 10 }, (_, i) => ({
    concept_id: `c${i}`,
    topic: null,
    attempted: 5,
    proficient: i % 5,
  }))
  const dynamic = lockedShelf({ ...base, concepts }, []).filter((item) => item.id.startsWith("concept_cleared:"))
  assert.equal(dynamic.length, MAX_DYNAMIC_LOCKED)
  assert.ok((dynamic[0]!.progress ?? 0) >= (dynamic[dynamic.length - 1]!.progress ?? 0))
})
