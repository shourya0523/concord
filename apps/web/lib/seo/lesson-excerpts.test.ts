import assert from "node:assert/strict"
import test from "node:test"

import { CURRICULUM_CONCEPTS } from "@/lib/data/curriculum"
import { excerptLesson, lessonExcerptsForConcept, splitSections } from "./lesson-excerpts"

test("splitSections splits on ## headings only", () => {
  const md = "intro\n## The idea\nA **DCF** values cash.\n### Detail\nmore\n## Interview answer template\n\"Project UFCF…\""
  assert.deepEqual(splitSections(md), [
    { heading: "The idea", body: "A **DCF** values cash.\n### Detail\nmore" },
    { heading: "Interview answer template", body: '"Project UFCF…"' },
  ])
})

test("excerptLesson takes the lead and the interview-answer section", () => {
  const excerpt = excerptLesson("## A\nlead\n## B\nmiddle\n## One-line answer\nsay this")
  assert.equal(excerpt?.lead.heading, "A")
  assert.equal(excerpt?.answer?.body, "say this")
  assert.equal(excerptLesson("## A\nlead\n## B\nb")?.answer, null)
  assert.equal(excerptLesson("no headings"), null)
})

test("every curriculum concept has at least one lesson excerpt", () => {
  for (const concept of CURRICULUM_CONCEPTS) {
    const excerpts = lessonExcerptsForConcept(concept.id)
    assert.ok(excerpts.length > 0, concept.id)
    for (const excerpt of excerpts) assert.ok(excerpt.lead.body.length > 40, excerpt.checkpointId)
  }
  const dcf = lessonExcerptsForConcept("concept_dcf_wacc")
  assert.ok(dcf.some((excerpt) => excerpt.answer?.heading === "Interview answer template"))
})
