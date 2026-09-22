import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { toStudyPayload } from "./questions"
import {
  filterSeedQuestions,
  parseTeachingSeed,
  seedRowToCanonical,
  seedRowToStudy,
} from "./teaching-seed-fallback"

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../../packages/search/fixtures/teaching_seed.json", import.meta.url),
    "utf8",
  ),
) as unknown

describe("teaching seed → study payload", () => {
  const seed = parseTeachingSeed(fixture)

  it("parses the curated seed fixture", () => {
    assert.ok(seed.questions.length > 0)
    assert.match(seed.source_label, /Teaching seed/)
  })

  it("maps a seed answer into a non-empty study payload with seed provenance", () => {
    const row = seed.questions[0]!
    const question = seedRowToCanonical(row)
    const study = seedRowToStudy(row, seed.source_label)
    const payload = toStudyPayload({ question, study })

    assert.equal(question.id, row.id)
    assert.equal(question.canonical_wording, row.question)
    assert.equal(study.direct_answer, row.answer)
    assert.equal(payload.layers.direct_answer, row.answer)
    // Single-answer seed rows add no synthetic layers.
    assert.equal(study.interview_ready_explanation, null)
    assert.deepEqual(study.step_by_step, [])
    assert.equal(study.validation?.provenance_type, "static_seed")
    assert.deepEqual(
      payload.layers.provenance.citations.map((c) => c.provenance),
      ["static_seed"],
    )
    assert.deepEqual(payload.layers.provenance.source_ids, [study.answer_id])
    assert.ok(study.sources.every((s) => s.provenance !== "glassdoor_occurrence"))
  })

  it("maps optional curated layers when a row carries them", () => {
    const row = {
      id: "seed_x",
      domain: "pe",
      topic: "lbo",
      question: "Walk me through a paper LBO.",
      answer: "Buy at 5x, lever 3x, grow EBITDA, exit at 5x.",
      interview_ready_explanation: "Returns come from EBITDA growth and debt paydown.",
      step_by_step: ["Entry", " ", "Exit"],
      formulae: ["MOIC = exit equity / entry equity"],
      common_mistakes: ["Forgetting fees"],
    }
    const study = seedRowToStudy(row, "Teaching seed")
    const payload = toStudyPayload({ question: seedRowToCanonical(row), study })

    assert.equal(payload.layers.interview_ready, row.interview_ready_explanation)
    assert.equal(payload.layers.walkthrough, "Entry\n\nExit")
    assert.deepEqual(
      payload.layers.formulae.map((f) => f.expression),
      row.formulae,
    )
    assert.deepEqual(payload.layers.common_mistakes, row.common_mistakes)
  })

  it("refuses a seed flagged as Glassdoor-derived", () => {
    const parsed = parseTeachingSeed({
      not_glassdoor: false,
      questions: [{ id: "g1", question: "Q", answer: "A" }],
    })
    assert.equal(parsed.questions.length, 0)
  })

  it("filters by track (domain) and topic", () => {
    const pe = filterSeedQuestions(seed, { track: "PE" })
    assert.ok(pe.length > 0)
    assert.ok(pe.every((r) => r.domain === "pe" || r.domain === "both"))
    const valuation = filterSeedQuestions(seed, { topic: "valuation" })
    assert.ok(valuation.length > 0)
    assert.ok(valuation.every((r) => r.topic === "valuation"))
  })
})
