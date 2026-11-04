import assert from "node:assert/strict"
import test from "node:test"

import { isPublicPath } from "../auth/gate"
import { guidePaths, publicConcept, publicConcepts, publicModule, publicModules, signUpFor } from "./public-content"

delete process.env.DATABASE_URL

test("guide paths are public and sign-up returns to the in-app page", () => {
  for (const path of [guidePaths.hub, guidePaths.concept("dcf-wacc"), guidePaths.module("x"), guidePaths.firm("gs")]) {
    assert.ok(isPublicPath(path), path)
  }
  assert.equal(signUpFor("/concepts/dcf-wacc"), "/sign-up?next=%2Fconcepts%2Fdcf-wacc")
})

test("every concept and module resolves to a public page (no DB)", async () => {
  const concepts = await publicConcepts()
  assert.ok(concepts.length > 0)
  for (const concept of concepts) {
    const page = await publicConcept(concept.slug)
    assert.ok(page, concept.slug)
    assert.ok(!page.prerequisites.some((p) => p.id === concept.id), "no self-prerequisite")
    assert.ok(!page.related.some((r) => r.id === concept.id), "no self-link in related")
  }
  for (const learningModule of await publicModules()) {
    const page = await publicModule(learningModule.slug)
    assert.ok(page, learningModule.slug)
  }
})

test("unknown slugs and id lookups do not create duplicate pages", async () => {
  assert.equal(await publicConcept("definitely-not-a-concept"), null)
  const [first] = await publicConcepts()
  if (first && first.id !== first.slug) assert.equal(await publicConcept(first.id), null)
})
