/**
 * Mastery math shared by the attempt writer (DB + in-memory), the mastery
 * reader and client islands. Pure and dependency-free (P0.1 / P0.4).
 *
 * One formula everywhere: question mastery is an exponential moving average
 * of graded scores (first attempt = its score); concept mastery is the mean of
 * the learner's attempted questions in that concept (unseen questions carry
 * zero weight).
 */
import type { Mastery } from "@ibpe/contracts"

/** Level thresholds — the single source of truth (was duplicated in attempts.ts / mastery.ts). */
export const MASTERY_THRESHOLDS = {
  mastered: 0.85,
  proficient: 0.68,
  familiar: 0.45,
} as const

/** Below proficient = weak (dashboard, weak topics, study plan). */
export const WEAK_MASTERY_THRESHOLD = MASTERY_THRESHOLDS.proficient

/** Weight of the newest graded score in the question-mastery EMA. */
export const MASTERY_EMA_ALPHA = 0.5

/** `attempted` keeps a 0-score attempt at "learning" rather than "unseen". */
export function levelFromScore(score: number, attempted = false): Mastery["level"] {
  if (score >= MASTERY_THRESHOLDS.mastered) return "mastered"
  if (score >= MASTERY_THRESHOLDS.proficient) return "proficient"
  if (score >= MASTERY_THRESHOLDS.familiar) return "familiar"
  if (score > 0 || attempted) return "learning"
  return "unseen"
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Next question mastery after a graded score. Mirrors the SQL upsert in
 * lib/data/attempts.ts: `(1-α)·old + α·new` on conflict, `new` on insert.
 */
export function nextQuestionMastery(previous: number | null | undefined, score: number): number {
  const s = clamp01(score)
  if (previous == null || !Number.isFinite(previous)) return s
  return clamp01((1 - MASTERY_EMA_ALPHA) * previous + MASTERY_EMA_ALPHA * s)
}

/** Concept roll-up: mean of attempted question mastery (empty → null, not 0). */
export function conceptMastery(questionMastery: number[]): number | null {
  const values = questionMastery.filter((v) => Number.isFinite(v))
  if (values.length === 0) return null
  return clamp01(values.reduce((sum, v) => sum + v, 0) / values.length)
}
