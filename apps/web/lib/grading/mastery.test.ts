import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { weakTopicsFromMastery, WEAK_THRESHOLD } from "../weak-topics"
import { incrementWindow, TtlLru, type LruEntry } from "./lru"
import {
  conceptMastery,
  levelFromScore,
  MASTERY_THRESHOLDS,
  nextQuestionMastery,
} from "./mastery"
import { ratingForAttempt, ratingFromGrade } from "./review-rating"

describe("mastery math", () => {
  it("uses one set of level thresholds", () => {
    assert.equal(levelFromScore(0.9), "mastered")
    assert.equal(levelFromScore(MASTERY_THRESHOLDS.mastered), "mastered")
    assert.equal(levelFromScore(0.7), "proficient")
    assert.equal(levelFromScore(0.5), "familiar")
    assert.equal(levelFromScore(0.1), "learning")
    assert.equal(levelFromScore(0), "unseen")
    assert.equal(WEAK_THRESHOLD, MASTERY_THRESHOLDS.proficient)
  })

  it("question mastery: first score, then EMA α=0.5 (same formula as the SQL upsert)", () => {
    assert.equal(nextQuestionMastery(null, 0.8), 0.8)
    assert.equal(nextQuestionMastery(0.8, 0.4), 0.6000000000000001)
    assert.equal(nextQuestionMastery(0.2, 1.4), 0.6)
  })

  it("concept mastery is the mean of attempted question mastery", () => {
    assert.equal(conceptMastery([]), null)
    assert.equal(conceptMastery([0.2, 0.6, 1]), 0.6)
  })

  it("weak topics become non-empty once concept rows exist", () => {
    const weak = weakTopicsFromMastery([
      { subject_type: "canonical_question", subject_id: "cq_1", score: 0.1 },
      { subject_type: "concept", subject_id: "concept_dcf_wacc", score: 0.4 },
      { subject_type: "concept", subject_id: "concept_lbo_paper_lbo", score: 0.9 },
    ])
    assert.deepEqual(
      weak.map((w) => w.topic),
      ["valuation"],
    )
  })
})

describe("review rating glue", () => {
  it("maps graded scores onto mastery bands", () => {
    assert.equal(ratingFromGrade(0.3), "again")
    assert.equal(ratingFromGrade(0.6), "hard")
    assert.equal(ratingFromGrade(0.8), "good")
    assert.equal(ratingFromGrade(0.95), "easy")
  })

  it("prefers the explicit button, then the graded score, then self confidence", () => {
    assert.equal(
      ratingForAttempt({ explicit: "hard", scoreSource: "llm", score: 0.95 }),
      "hard",
    )
    assert.equal(ratingForAttempt({ scoreSource: "llm", score: 0.95, confidence: 0.1 }), "easy")
    assert.equal(ratingForAttempt({ scoreSource: "numeric", score: 0.2 }), "again")
    assert.equal(ratingForAttempt({ scoreSource: "self", score: 0.5, confidence: 0.9 }), "easy")
  })

  it("skips scheduling for reveal-copy attempts", () => {
    assert.equal(ratingForAttempt({ explicit: "easy", scoreSource: "reveal_copy", score: 1 }), null)
  })
})

describe("TtlLru", () => {
  it("evicts least-recently used entries and expires by TTL", () => {
    let now = 0
    const lru = new TtlLru<number>(new Map<string, LruEntry<number>>(), 2, 1000, () => now)
    lru.set("a", 1)
    lru.set("b", 2)
    assert.equal(lru.get("a"), 1) // a is now most recent
    lru.set("c", 3)
    assert.equal(lru.get("b"), undefined)
    assert.equal(lru.get("a"), 1)
    now = 2000
    assert.equal(lru.get("a"), undefined)
  })

  it("counts per fixed window", () => {
    const map = new Map<string, LruEntry<number>>()
    assert.equal(incrementWindow(map, "u", 1000, 0), 1)
    assert.equal(incrementWindow(map, "u", 1000, 10), 2)
    assert.equal(incrementWindow(map, "u", 1000, 1001), 1)
  })
})
