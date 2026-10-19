import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CreateAttemptRequestSchema } from "@/lib/api/schemas"

import {
  buildAttemptBody,
  followUpResponseText,
  gradeStatus,
  parseAttemptResponse,
  withDelivery,
} from "./attempt-client"

describe("attempt-client", () => {
  it("prefixes follow-up answers with the interviewer's question", () => {
    assert.equal(
      followUpResponseText(" What if capex doubles? ", " FCF falls. "),
      "[Interviewer follow-up: What if capex doubles?]\nFCF falls.",
    )
  })

  it("builds a body the attempts schema accepts, including revealed_at", () => {
    const body = buildAttemptBody({
      canonical_question_id: "q1",
      response_text: "EV = equity + net debt",
      confidence: 0.75,
      revealed_at: "2026-09-23T10:00:00.000Z",
      delivery: { score: 0.8, words_per_minute: 150 },
    })
    const parsed = CreateAttemptRequestSchema.parse(body)
    assert.equal(parsed.revealed_at, "2026-09-23T10:00:00.000Z")
    const bare = buildAttemptBody({ canonical_question_id: "q1", response_text: "x" })
    assert.equal("revealed_at" in bare, false)
    assert.equal("delivery" in bare, false)
  })

  it("parses whatever grade fields are present", () => {
    const parsed = parseAttemptResponse({
      grade: { score: 0.62, score_source: "llm", follow_up: "Why?" },
      activity: { xp_awarded: 6, achievements_earned: [] },
      review: { due_at: "2026-09-24T00:00:00Z" },
    })
    assert.equal(parsed.grade?.score, 0.62)
    assert.deepEqual(parsed.grade?.citations, [])
    assert.equal(parsed.grade?.follow_up, "Why?")
    assert.equal(parsed.activity?.xp_awarded, 6)
    assert.equal(parsed.review?.due_at, "2026-09-24T00:00:00Z")
    assert.equal(parseAttemptResponse({}).grade, null)
    assert.equal(parseAttemptResponse(null).activity, null)
  })

  it("merges client delivery only when the backend did not echo one", () => {
    const grade = { score: 0.5, score_source: "llm" as const, weak_topics: [], citations: [] }
    assert.equal(withDelivery(grade, { score: 0.7 }).delivery?.score, 0.7)
    assert.equal(withDelivery({ ...grade, delivery: { score: 0.2 } }, { score: 0.7 }).delivery?.score, 0.2)
  })

  it("labels grade sources", () => {
    const base = { weak_topics: [], citations: [] }
    assert.equal(gradeStatus({ ...base, score: 0.72, score_source: "llm" }), "AI-graded 72%")
    assert.equal(gradeStatus({ ...base, score: 0.4, score_source: "deterministic" }), "Estimated 40%")
    assert.equal(gradeStatus({ ...base, score: 0.9, score_source: "reveal_copy" }), "Copied after reveal — not counted")
  })
})
