import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ProposalPlanError,
  diffJson,
  diffLines,
  planProposalApplication,
  type ProposalRow,
} from "./proposals"

function row(partial: Partial<ProposalRow>): ProposalRow {
  return {
    id: "prop_1",
    target_kind: "rubric",
    target_id: "ans_1",
    field: "rubric_json",
    proposal_json: null,
    current_json: null,
    model: null,
    prompt_version: "v1",
    confidence: 0.8,
    status: "pending",
    auto_approved: false,
    reviewer: null,
    review_note: null,
    decided_at: null,
    created_at: "2026-09-23T00:00:00Z",
    ...partial,
  }
}

const rubric = {
  key_points: [
    { id: "kp1", text: "Net income flows to CFO", weight: 0.6, must_have: true },
    { id: "kp2", text: "Cash links to the balance sheet", weight: 0.4 },
  ],
  provenance: "llm",
}

describe("planProposalApplication", () => {
  it("approves rubrics as AnswerRubric with review_status approved", () => {
    const plan = planProposalApplication(row({ proposal_json: rubric }))
    assert.equal(plan.kind, "rubric")
    if (plan.kind === "rubric") {
      assert.equal(plan.rubric.review_status, "approved")
      assert.equal(plan.rubric.key_points.length, 2)
      assert.equal(plan.target_id, "ans_1")
    }
  })

  it("rejects malformed rubrics", () => {
    assert.throws(
      () => planProposalApplication(row({ proposal_json: { key_points: [] } })),
      ProposalPlanError,
    )
  })

  it("uses a reviewer edit instead of the stored proposal", () => {
    const plan = planProposalApplication(row({ proposal_json: { bad: true } }), rubric)
    assert.equal(plan.kind, "rubric")
  })

  it("maps taxonomy proposals to topic / difficulty / domain updates", () => {
    const plan = planProposalApplication(
      row({
        target_kind: "question",
        target_id: "cq_1",
        field: "taxonomy",
        proposal_json: { topic: "lbo", difficulty: "Core", domain: "pe", extra: 1 },
      }),
    )
    assert.deepEqual(plan, {
      kind: "question_taxonomy",
      question_id: "cq_1",
      set: { topic: "lbo", difficulty: "core", domain: "pe" },
    })
    const single = planProposalApplication(
      row({ target_kind: "question", field: "topic", proposal_json: "valuation" }),
    )
    assert.ok(single.kind === "question_taxonomy" && single.set.topic === "valuation")
    assert.throws(
      () =>
        planProposalApplication(
          row({ target_kind: "question", field: "topic", proposal_json: "astrology" }),
        ),
      /unknown topic/,
    )
  })

  it("plans lesson, diagram and occurrence writes", () => {
    const lesson = planProposalApplication(
      row({ target_kind: "lesson", target_id: "chk_x", field: "body_markdown", proposal_json: "## Hi\n\nBody" }),
    )
    assert.equal(lesson.kind, "lesson_body")
    const questions = planProposalApplication(
      row({ target_kind: "lesson", target_id: "chk_x", field: "question_ids", proposal_json: ["a", "a", "b"] }),
    )
    assert.ok(questions.kind === "lesson_questions" && questions.question_ids.length === 2)
    const mermaid = planProposalApplication(
      row({ target_kind: "diagram", target_id: "diag_x", field: "body", proposal_json: "flowchart LR\n  A --> B" }),
    )
    assert.ok(mermaid.kind === "diagram_body" && mermaid.format === "mermaid")
    assert.throws(() =>
      planProposalApplication(
        row({ target_kind: "diagram", field: "body", proposal_json: { format: "interactive-json", body: "{}" } }),
      ),
    )
    const join = planProposalApplication(
      row({
        target_kind: "occurrence",
        target_id: "occ_1",
        field: "join",
        proposal_json: { canonical_question_id: "cq_1", join_score: 0.91, join_method: "embedding" },
      }),
    )
    assert.ok(join.kind === "occurrence_join" && join.join_score === 0.91)
    assert.throws(
      () => planProposalApplication(row({ target_kind: "lesson", field: "body_markdown", proposal_json: "<script>x</script>" })),
      ProposalPlanError,
    )
  })
})

describe("diffs", () => {
  it("reports added, removed and changed paths", () => {
    const entries = diffJson({ topic: "lbo", difficulty: "core" }, { topic: "valuation", domain: "ib" })
    assert.deepEqual(
      entries.map((e) => `${e.path}:${e.change}`),
      ["difficulty:removed", "domain:added", "topic:changed"],
    )
    assert.deepEqual(diffJson(null, "x"), [{ path: "(root)", change: "added", after: "x" }])
  })

  it("computes a minimal line diff", () => {
    const lines = diffLines("a\nb\nc", "a\nx\nc")
    assert.deepEqual(
      lines.map((l) => `${l.op}:${l.text}`),
      ["same:a", "del:b", "add:x", "same:c"],
    )
  })
})
