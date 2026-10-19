import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlacementQuestion } from "@/lib/api/retention-schemas"
import { PLACEMENT_SIZE, pickPlacement } from "./placement"

const q = (id: string, topic: string | null, difficulty: string | null = null): PlacementQuestion => ({
  question_id: id,
  prompt: id,
  topic,
  concept_id: null,
  difficulty,
})

describe("pickPlacement", () => {
  it("takes the easiest and hardest question per core topic", () => {
    const pool = [
      q("acc_hard", "accounting", "hard"),
      q("acc_easy", "accounting", "easy"),
      q("acc_med", "accounting", "medium"),
      q("ev_1", "enterprise_value", "medium"),
      q("val_easy", "valuation", "easy"),
      q("val_hard", "valuation", "hard"),
      q("lbo_1", "lbo"),
      q("lbo_2", "lbo", "hard"),
      q("ma_1", "merger_models", "easy"),
      q("ma_2", "merger_models", "medium"),
      q("mk_1", "markets"),
      q("mk_2", "markets"),
    ]
    const picked = pickPlacement(pool).map((item) => item.question_id)
    assert.equal(picked.length, PLACEMENT_SIZE)
    assert.deepEqual(picked.slice(0, 2), ["acc_easy", "acc_hard"])
    assert.ok(picked.includes("val_easy") && picked.includes("val_hard"))
    assert.ok(picked.includes("ev_1"))
    assert.ok(!picked.includes("acc_med") || picked.length === PLACEMENT_SIZE)
    assert.equal(new Set(picked).size, picked.length)
  })

  it("fills from other topics and degrades gracefully", () => {
    const pool = [q("a", "accounting"), q("b", "markets"), q("c", null), q("d", "markets")]
    assert.deepEqual(
      pickPlacement(pool).map((item) => item.question_id),
      ["a", "b", "c", "d"],
    )
    assert.deepEqual(pickPlacement([]), [])
  })
})
