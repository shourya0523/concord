/**
 * Spaced review scheduler (§10.9) — SM-2-lite over Again/Hard/Good/Easy.
 *
 * Pure: no I/O, so it runs identically on the server (review queue writes)
 * and in tests. Intervals are in days; "again" re-queues the card the same day.
 */

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const
export type ReviewRating = (typeof REVIEW_RATINGS)[number]

export type ReviewState = {
  interval_days: number
  ease: number
  repetitions: number
}

export type ScheduledReview = ReviewState & {
  due_at: string
  last_rating: ReviewRating
}

export const INITIAL_REVIEW_STATE: ReviewState = {
  interval_days: 0,
  ease: 2.5,
  repetitions: 0,
}

const MIN_EASE = 1.3
const MAX_EASE = 3.0
const MAX_INTERVAL_DAYS = 120
/** "Again" cards come back within the same sitting. */
const RELEARN_MINUTES = 10
const DAY_MS = 24 * 60 * 60 * 1000

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100))
}

/**
 * Map the study page's 0–1 self-rating (or a grade score when the learner
 * skipped rating) onto the four review buttons.
 */
export function ratingFromScore(score: number | null | undefined): ReviewRating {
  if (score == null || Number.isNaN(score)) return "hard"
  if (score <= 0.25) return "again"
  if (score <= 0.5) return "hard"
  if (score <= 0.75) return "good"
  return "easy"
}

export function scheduleReview(
  previous: ReviewState | null | undefined,
  rating: ReviewRating,
  now: Date = new Date(),
): ScheduledReview {
  const prev = previous ?? INITIAL_REVIEW_STATE
  let { ease, repetitions } = prev
  let interval: number

  switch (rating) {
    case "again":
      ease = clampEase(ease - 0.2)
      repetitions = 0
      interval = 0
      break
    case "hard":
      ease = clampEase(ease - 0.15)
      repetitions += 1
      interval = Math.max(1, Math.round(prev.interval_days * 1.2))
      break
    case "good":
      repetitions += 1
      interval =
        repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(prev.interval_days * ease)
      break
    case "easy":
      ease = clampEase(ease + 0.15)
      repetitions += 1
      interval =
        repetitions === 1 ? 4 : Math.round(Math.max(prev.interval_days, 1) * ease * 1.3)
      break
  }

  interval = Math.min(MAX_INTERVAL_DAYS, interval)
  const dueMs =
    interval === 0 ? now.getTime() + RELEARN_MINUTES * 60 * 1000 : now.getTime() + interval * DAY_MS

  return {
    interval_days: interval,
    ease,
    repetitions,
    due_at: new Date(dueMs).toISOString(),
    last_rating: rating,
  }
}

/** Human label for the status line: "in 10 min", "tomorrow", "in 6 days". */
export function describeDue(dueAt: string, now: Date = new Date()): string {
  const diffMs = new Date(dueAt).getTime() - now.getTime()
  if (diffMs <= 0) return "now"
  if (diffMs < 60 * 60 * 1000) return `in ${Math.max(1, Math.round(diffMs / 60000))} min`
  const days = Math.round(diffMs / DAY_MS)
  if (days <= 1) return "tomorrow"
  return `in ${days} days`
}
