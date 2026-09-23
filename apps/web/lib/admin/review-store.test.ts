import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { comparable } from "./review-store"

describe("comparable (diff shaping)", () => {
  it("compares a scalar proposal with the named field", () => {
    assert.equal(
      comparable({ topic: "lbo" }, { target_kind: "question", field: "topic", proposal_json: "valuation" }),
      "lbo",
    )
  })

  it("limits taxonomy diffs to the proposed keys", () => {
    assert.deepEqual(
      comparable(
        { topic: "lbo", subtopic: null, difficulty: "core", domain: "pe", question_type: "technical" },
        { target_kind: "question", field: "taxonomy", proposal_json: { topic: "valuation", domain: "ib" } },
      ),
      { topic: "lbo", domain: "pe" },
    )
  })

  it("compares a bare diagram body with the current body", () => {
    assert.equal(
      comparable(
        { format: "mermaid", body: "flowchart LR\n  A --> B" },
        { target_kind: "diagram", field: "mermaid", proposal_json: "flowchart LR\n  A --> C" },
      ),
      "flowchart LR\n  A --> B",
    )
  })
})
