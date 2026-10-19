import assert from "node:assert/strict"
import test from "node:test"

import { careerCard, careerTrack, levelChange, titleForLevel } from "./career"

test("titleForLevel maps the IB ladder", () => {
  assert.equal(titleForLevel(1), "Intern")
  assert.equal(titleForLevel(3), "Analyst II")
  assert.equal(titleForLevel(8), "Vice President")
  assert.equal(titleForLevel(10), "Managing Director")
})

test("titleForLevel continues past the ladder in years", () => {
  assert.equal(titleForLevel(11), "Managing Director, 2nd year")
  assert.equal(titleForLevel(12), "Managing Director, 3rd year")
  assert.equal(titleForLevel(13), "Managing Director, 4th year")
  assert.equal(titleForLevel(21), "Managing Director, 12th year")
})

test("PE track uses the buy-side ladder", () => {
  assert.equal(careerTrack("PE"), "PE")
  assert.equal(careerTrack("Both"), "IB")
  assert.equal(careerTrack(null), "IB")
  assert.equal(titleForLevel(6, "PE"), "Senior Associate")
  assert.equal(titleForLevel(10, "PE"), "Partner")
})

test("careerCard reports progress toward the next title", () => {
  const card = careerCard(340)
  assert.equal(card.level, 3)
  assert.equal(card.title, "Analyst II")
  assert.equal(card.next_title, "Analyst III")
  assert.equal(card.floor, 250)
  assert.equal(card.next, 500)
  assert.ok(Math.abs(card.progress - 0.36) < 1e-9)
})

test("levelChange detects promotions only", () => {
  assert.deepEqual(levelChange(495, 503), { from: 3, to: 4 })
  assert.equal(levelChange(100, 120), null)
  assert.deepEqual(levelChange(0, 260), { from: 1, to: 3 })
})
