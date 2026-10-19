/**
 * XP + levels (plan 2026-09-23-001 P5.5, KD-7). XP rewards graded quality,
 * not volume — readiness stays the hero metric.
 */
import type { ActivityKind } from "@ibpe/contracts"

export const XP_PER_POINT = 10
export const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000
export const REPEAT_MULTIPLIER = 0.5
export const DAILY_GOAL_BONUS = 20
export const MOCK_COMPLETE_BONUS = 50

/** Cumulative XP needed for each level (level 1 starts at 0). */
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000] as const
const LEVEL_STEP_AFTER_TABLE = 3500

export type XpInput = {
  kind: ActivityKind
  score: number | null
  scoreSource: string
  countsTowardGoal: boolean
  /** Same subject graded within the last 24 h. */
  repeatedWithin24h: boolean
}

/** XP for one learning event (the daily-goal bonus is added separately). */
export function xpForEvent(input: XpInput): number {
  if (input.kind === "mock_complete") return MOCK_COMPLETE_BONUS
  if (!input.countsTowardGoal || input.scoreSource === "reveal_copy") return 0
  if (input.score == null || !Number.isFinite(input.score)) return 0
  const base = Math.round(XP_PER_POINT * Math.min(1, Math.max(0, input.score)))
  return input.repeatedWithin24h ? Math.round(base * REPEAT_MULTIPLIER) : base
}

export type LevelInfo = {
  level: number
  /** XP at which the current level started. */
  floor: number
  /** XP needed for the next level. */
  next: number
  /** 0–1 progress through the current level. */
  progress: number
}

function thresholdFor(levelIndex: number): number {
  if (levelIndex < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[levelIndex] as number
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] as number
  return last + (levelIndex - LEVEL_THRESHOLDS.length + 1) * LEVEL_STEP_AFTER_TABLE
}

export function levelForXp(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp))
  let index = 0
  while (thresholdFor(index + 1) <= total) index += 1
  const floor = thresholdFor(index)
  const next = thresholdFor(index + 1)
  return {
    level: index + 1,
    floor,
    next,
    progress: next === floor ? 1 : (total - floor) / (next - floor),
  }
}
