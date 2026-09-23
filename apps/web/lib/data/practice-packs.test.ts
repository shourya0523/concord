import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizePracticeMode } from "@ibpe/contracts"

describe("normalizePracticeMode", () => {
  it("maps legacy pseudo_rag to rag", () => {
    assert.equal(normalizePracticeMode("pseudo_rag"), "rag")
    assert.equal(normalizePracticeMode("rag"), "rag")
    assert.equal(normalizePracticeMode("company"), "company")
    assert.equal(normalizePracticeMode("nope"), "adaptive_weak")
  })
})

describe("simulator pack stage topics", () => {
  it("uses the shared STAGE_CONCEPT topics and never repeats a question", async () => {
    const { buildPracticePack } = await import("./practice-packs")
    const { stageTopics } = await import("@/lib/simulator/select")
    const pack = await buildPracticePack({
      userId: "u_test",
      input: {
        mode: "simulator",
        learning_mode: "company_prep",
        firm_ids: [],
        concept_ids: [],
        question_ids: [],
        limit: 4,
      } as never,
    })
    assert.equal(pack.mode, "simulator")
    const stageIds = Object.keys(pack.stage_topic_map ?? {})
    assert.equal(stageIds.length, 4)
    for (const stageId of stageIds) {
      assert.deepEqual(pack.stage_topic_map?.[stageId], stageTopics(stageId))
    }
    assert.equal(new Set(pack.question_ids).size, pack.question_ids.length)
  })
})
