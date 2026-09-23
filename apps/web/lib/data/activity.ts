/**
 * Learning activity hook — every graded action (study attempt, numeric drill,
 * finished mock, placement check) reports here so streaks, XP, daily-set
 * progress and achievements update in one place.
 *
 * Implemented by the retention track (plan 2026-09-23-001 Phase 5). Callers
 * must treat a null result as "retention off" and never fail the attempt.
 */
import type { ActivityKind, ActivityResult } from "@ibpe/contracts"

export type LearningActivityEvent = {
  userId: string
  email?: string | null
  kind: ActivityKind
  /** Canonical question id or `drill:<template>:<seed>`. */
  subjectId?: string | null
  /** 0–1 graded score; null for ungraded/self-only actions. */
  score: number | null
  scoreSource: string
  /** False for reveal-copy or empty self-rated attempts. */
  countsTowardGoal: boolean
  at?: Date
}

export async function recordLearningActivity(
  _event: LearningActivityEvent,
): Promise<ActivityResult | null> {
  return null
}
