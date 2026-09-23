/**
 * Review glue (plan P4.1, KD-5 amended): SM-2-lite stays; when the learner
 * does not press a review button, the graded score picks the rating. Pure.
 */
import type { AttemptScoreSource } from "@ibpe/contracts"
import { ratingFromScore, type ReviewRating } from "../review-schedule"
import { MASTERY_THRESHOLDS } from "./mastery"

/** Graded score → rating on the same bands as mastery levels. */
export function ratingFromGrade(score: number): ReviewRating {
  if (!Number.isFinite(score)) return "hard"
  if (score < MASTERY_THRESHOLDS.familiar) return "again"
  if (score < MASTERY_THRESHOLDS.proficient) return "hard"
  if (score < MASTERY_THRESHOLDS.mastered) return "good"
  return "easy"
}

/**
 * Rating to apply for an attempt, or null when scheduling must be skipped
 * (reveal-copy earns no review credit and must not reset the card either).
 *
 * Priority: explicit button → graded score (llm / numeric / deterministic)
 * → self confidence / self score.
 */
export function ratingForAttempt(options: {
  explicit?: ReviewRating | null
  scoreSource: AttemptScoreSource
  score: number | null
  confidence?: number | null
}): ReviewRating | null {
  if (options.scoreSource === "reveal_copy") return null
  if (options.explicit) return options.explicit
  if (options.scoreSource !== "self" && options.score != null) {
    return ratingFromGrade(options.score)
  }
  return ratingFromScore(options.confidence ?? options.score ?? null)
}
