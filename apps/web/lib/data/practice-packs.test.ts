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
