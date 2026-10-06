import assert from "node:assert/strict"
import test from "node:test"

import { CARD_H, CARD_W, FACETS, facetPoints, mixHex, segment, skyAt, vertexAt } from "./plane-geometry"

function area(points: string): number {
  const p = points.split(" ").map((pair) => pair.split(",").map(Number) as [number, number])
  const [[x1, y1], [x2, y2], [x3, y3]] = p as [[number, number], [number, number], [number, number]]
  return Math.abs((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2)
}

test("unfolded facets tile the whole index card", () => {
  const total = FACETS.reduce((sum, facet) => sum + area(facetPoints(facet.vertices, 0)), 0)
  assert.equal(Math.round(total), CARD_W * CARD_H)
})

test("folded vertices land on the plane silhouette", () => {
  assert.deepEqual(vertexAt("nose", 1), [400, 125])
  assert.deepEqual(vertexAt("wingTipTop", 1), [70, 22])
  assert.deepEqual(vertexAt("tail", 0), [0, 125])
  const half = vertexAt("wingRootTop", 0.5)
  assert.ok(half[0] < 400 && half[0] > 250)
})

test("segment and mixHex clamp and blend", () => {
  assert.equal(segment(0.1, 0.2, 0.4), 0)
  assert.ok(Math.abs(segment(0.3, 0.2, 0.4) - 0.5) < 1e-9)
  assert.equal(segment(0.9, 0.2, 0.4), 1)
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080")
  assert.equal(mixHex("#112233", "#112233", 0.7), "#112233")
})

test("sky starts and ends on the cream desk and is dark at cruise", () => {
  assert.deepEqual(skyAt(0), { top: "#f7f1e4", bottom: "#f7f1e4" })
  assert.deepEqual(skyAt(1), { top: "#f7f1e4", bottom: "#f7f1e4" })
  assert.equal(skyAt(0.84).top, "#0f1730")
})
