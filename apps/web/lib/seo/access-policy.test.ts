import assert from "node:assert/strict"
import test from "node:test"

import { CURRICULUM_CONCEPTS } from "@/lib/data/curriculum"
import { lessonExcerptsForConcept } from "./lesson-excerpts"
import {
  OPEN_ANSWER_CONCEPT_SLUGS,
  PUBLIC_FIRM_TOPIC_COUNT,
  isAnswerPublic,
  splitPublic,
  unlockHref,
} from "./access-policy"

test("open concepts exist and actually have an interview answer to show", () => {
  const slugs = new Set(CURRICULUM_CONCEPTS.map((concept) => concept.slug))
  for (const slug of OPEN_ANSWER_CONCEPT_SLUGS) {
    const concept = CURRICULUM_CONCEPTS.find((c) => c.slug === slug)
    assert.ok(concept, slug)
    assert.ok(lessonExcerptsForConcept(concept.id).some((lesson) => lesson.answer), `${slug} has no answer section`)
  }
  assert.ok(isAnswerPublic("dcf-wacc"))
  assert.ok(!isAnswerPublic("lbo-paper-lbo"))
  // Most answers stay locked.
  assert.ok(OPEN_ANSWER_CONCEPT_SLUGS.size < slugs.size / 2)
})

test("splitPublic shows the top N and counts the rest", () => {
  assert.deepEqual(splitPublic([1, 2, 3, 4, 5], PUBLIC_FIRM_TOPIC_COUNT), { shown: [1, 2, 3], locked: 2 })
  assert.deepEqual(splitPublic([1], 3), { shown: [1], locked: 0 })
})

test("locks send people to sign-up and back to the in-app page", () => {
  assert.equal(unlockHref("/learn/dcf-wacc"), "/sign-up?next=%2Flearn%2Fdcf-wacc")
})
