import assert from "node:assert/strict"
import test from "node:test"

import { SKY_STOPS } from "./plane-geometry"
import { CLOUDS, DESK_ITEMS, FEATURE_WINDOWS, frameAt, windowOpacity } from "./scroll-frame"

test("the hero is up at the top and gone once the card folds", () => {
  const top = frameAt(0, false)
  assert.equal(top.fold, 0)
  assert.equal(top.pieces["hero-head"]!.opacity, 1)
  assert.equal(top.pieces["hero-cta"]!.opacity, 1)
  assert.equal(top.pieces["card-stack"]!.opacity, 1)
  const folding = frameAt(0.2, false)
  assert.ok(folding.fold > 0.5)
  assert.equal(folding.pieces["hero-cta"]!.opacity, 0)
})

test("exactly one sky layer is fully on and at most one fades over it", () => {
  for (const p of [0, 0.3, 0.5, 0.8, 0.95, 1]) {
    const opacities = SKY_STOPS.map((_, i) => frameAt(p, false).pieces[`sky-${i}`]!.opacity!)
    assert.ok(opacities.includes(1), `p=${p}`)
    assert.ok(opacities.filter((o) => o > 0 && o < 1).length <= 1, `p=${p}`)
  }
})

test("every animated piece gets a value at every progress", () => {
  const keys = Object.keys(frameAt(0, false).pieces)
  for (const key of [
    ...DESK_ITEMS.map((d) => d.key),
    ...CLOUDS.map((_, i) => `cloud-${i}`),
    ...FEATURE_WINDOWS.map((_, i) => `feature-${i}`),
    "plane",
    "earth",
    "contrail",
  ]) {
    assert.ok(keys.includes(key), key)
  }
  for (const p of [0.13, 0.47, 0.81, 0.99]) {
    for (const [key, style] of Object.entries(frameAt(p, true).pieces)) {
      if (style.opacity !== undefined) assert.ok(style.opacity >= 0 && style.opacity <= 1, `${key}@${p}`)
      if (style.transform !== undefined) assert.ok(!style.transform.includes("NaN"), `${key}@${p}`)
    }
  }
})

test("product cards show one after another and the plane lands at the end", () => {
  assert.equal(frameAt(0.46, false).pieces["feature-0"]!.opacity, 1)
  assert.equal(frameAt(0.46, false).pieces["feature-1"]!.opacity, 0)
  assert.equal(frameAt(1, false).pieces.plane!.opacity, 0)
  assert.equal(frameAt(0.86, false).contrail, 0)
  assert.equal(windowOpacity(0.5, [0.4, 0.6]), 1)
})
