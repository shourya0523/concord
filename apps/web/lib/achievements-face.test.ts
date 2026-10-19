import assert from "node:assert/strict"
import test from "node:test"

import { tombstoneFace } from "./achievements"

test("tombstoneFace gives each milestone a figure and caption", () => {
  assert.deepEqual(tombstoneFace({ id: "streak_7", title: "7-day streak" }), { face: "7", what: "Consecutive goal days" })
  assert.deepEqual(tombstoneFace({ id: "graded_100", title: "100 graded cards" }), { face: "100", what: "Answers graded" })
  assert.deepEqual(tombstoneFace({ id: "first_mock", title: "First mock interview" }), { face: "1st", what: "Mock interview" })
  assert.deepEqual(tombstoneFace({ id: "concept_cleared:lbo", title: "LBO cleared" }), { face: "LBO", what: "Concept cleared" })
  assert.deepEqual(tombstoneFace({ id: "readiness_80:firm_gs", title: "Goldman Sachs 80% ready" }), {
    face: "80%",
    what: "Goldman Sachs readiness",
  })
})
