import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeDelivery,
  countFillers,
  countWords,
  durationFit,
  fillerFit,
  paceFit,
} from "./delivery"

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ")
}

describe("delivery sub-scores", () => {
  it("duration: 60–90 s is ideal, decays outside", () => {
    assert.equal(durationFit(75_000), 1)
    assert.equal(durationFit(60_000), 1)
    assert.equal(durationFit(90_000), 1)
    assert.equal(durationFit(15_000), 0)
    assert.ok(durationFit(40_000) > 0 && durationFit(40_000) < 1)
    assert.ok(durationFit(135_000) > 0 && durationFit(135_000) < 1)
    assert.equal(durationFit(180_000), 0)
  })

  it("pace: 130–170 wpm is ideal", () => {
    assert.equal(paceFit(150), 1)
    assert.equal(paceFit(80), 0)
    assert.ok(paceFit(105) > 0.4 && paceFit(105) < 0.6)
    assert.equal(paceFit(230), 0)
  })

  it("filler: rate per 100 words", () => {
    assert.equal(fillerFit(0, 100), 1)
    assert.equal(fillerFit(8, 100), 0)
    assert.equal(fillerFit(4, 100), 0.5)
    assert.equal(fillerFit(0, 0), 0)
  })
})

describe("countFillers", () => {
  it("counts um/uh/you know/basically and filler like", () => {
    assert.equal(
      countFillers("Um so basically the EV is, like, uh the you know firm value. Umm."),
      6,
    )
  })

  it("ignores verb / comparison uses of like", () => {
    assert.equal(countFillers("I would like to walk through it. It looks like a DCF."), 0)
  })
})

describe("computeDelivery", () => {
  it("scores a clean 75 s answer at 150 wpm as 1", () => {
    const d = computeDelivery({ durationMs: 75_000, transcript: words(188) })
    assert.equal(d.score, 1)
    assert.equal(d.word_count, 188)
    assert.equal(d.filler_count, 0)
    assert.equal(d.words_per_minute, 150)
    assert.match(d.note ?? "", /Clean delivery/)
  })

  it("penalises a short, filler-heavy answer", () => {
    const transcript = `um uh like ${words(40)} you know basically um`
    const d = computeDelivery({ durationMs: 25_000, transcript })
    assert.ok((d.score ?? 1) < 0.6, `score ${d.score}`)
    assert.ok((d.filler_count ?? 0) >= 6)
  })

  it("returns 0 with a note when nothing was said", () => {
    const d = computeDelivery({ durationMs: 10_000, transcript: "   " })
    assert.equal(d.score, 0)
    assert.equal(d.word_count, 0)
    assert.match(d.note ?? "", /No speech/)
  })

  it("stays within 0–1", () => {
    for (const ms of [1, 30_000, 70_000, 200_000]) {
      for (const n of [1, 50, 400]) {
        const d = computeDelivery({ durationMs: ms, transcript: words(n) })
        assert.ok(d.score! >= 0 && d.score! <= 1)
      }
    }
  })

  it("counts words", () => {
    assert.equal(countWords("EV = equity + net debt, roughly $5bn."), 6)
  })
})
