/**
 * Warren's mood from learning state (plan 2026-09-23-001 P5.7). Pure — the
 * Today / dashboard / progress islands pass the result to <WarrenCallout>.
 *
 * Tone rules (RSK-3): no loss messaging, no guilt. At-risk copy is a nudge,
 * a lapse is a welcome back.
 */
import type { WarrenMood } from "@/components/paper"

export const STREAK_AT_RISK_HOUR = 18

export type WarrenState = "celebrating" | "streak_at_risk" | "returning" | "on_track" | "fresh"

export type WarrenInput = {
  goalMetToday: boolean
  streakCurrent: number
  longestStreak: number
  /** Local hour 0–23 in the learner's zone. */
  localHour: number
  /** Days since the last day the goal was met or frozen (null = never). */
  daysSinceCovered: number | null
  /** Achievements just earned in this view. */
  justEarned?: number
  cardsLeft?: number
}

export type WarrenReading = { state: WarrenState; mood: WarrenMood; message: string }

export function warrenMoodFor(input: WarrenInput): WarrenReading {
  const left = Math.max(0, input.cardsLeft ?? 0)
  if (input.goalMetToday || (input.justEarned ?? 0) > 0) {
    return {
      state: "celebrating",
      mood: "celebrating",
      message:
        input.streakCurrent > 1
          ? `Goal met — ${input.streakCurrent} days running. Anything more today is a bonus.`
          : "Goal met for today. Anything more is a bonus.",
    }
  }
  if (input.streakCurrent > 0 && input.localHour >= STREAK_AT_RISK_HOUR) {
    return {
      state: "streak_at_risk",
      mood: "concerned",
      message:
        left > 0
          ? `${left} card${left === 1 ? "" : "s"} keeps your ${input.streakCurrent}-day streak going tonight.`
          : `A short set tonight keeps your ${input.streakCurrent}-day streak going.`,
    }
  }
  const lapsed = input.daysSinceCovered !== null && input.daysSinceCovered >= 2
  if (lapsed && input.streakCurrent === 0 && input.longestStreak > 0) {
    return {
      state: "returning",
      mood: "encouraging",
      message: "Welcome back. Today's set starts with what's due — one set restarts the streak.",
    }
  }
  if (input.daysSinceCovered === null && input.longestStreak === 0) {
    return {
      state: "fresh",
      mood: "encouraging",
      message: "Start with today's set — every graded card sharpens your readiness.",
    }
  }
  return {
    state: "on_track",
    mood: "encouraging",
    message:
      input.streakCurrent > 0
        ? `On track — finish today's set to make it ${input.streakCurrent + 1} days.`
        : "On track. Finish today's set to start a streak.",
  }
}
