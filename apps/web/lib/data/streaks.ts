/**
 * Streak engine — pure transitions (plan 2026-09-23-001 P5.2 / P5.3, KD-6).
 *
 * A streak counts consecutive local days on which the daily goal was met.
 * Semantics match migration 045 exactly:
 *   app.user_streaks.current_streak / longest_streak — goal-met day counts
 *   app.user_streaks.freezes        — banked freezes, 0..2
 *   app.user_streaks.last_goal_date — last local day the goal was met
 *   app.daily_activity.freeze_used  — a missed day covered by a freeze
 *
 * Freezes are earned (1 per 7 consecutive goal days, max 2), never bought, and
 * a freeze only ever covers a *single* missed day. A freeze day keeps the
 * streak alive without adding to it.
 */
import { addDays, daysBetween, maxLocalDate } from "@/lib/local-day"

export const MAX_FREEZES = 2
export const FREEZE_EARN_EVERY = 7
/** Longest run of missed days a freeze can bridge. */
export const MAX_FREEZE_GAP = 1

export type StreakState = {
  current: number
  longest: number
  freezes: number
  last_goal_date: string | null
  /** Latest local day covered by a freeze (from daily_activity.freeze_used). */
  last_freeze_date: string | null
  xp_total: number
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  longest: 0,
  freezes: 0,
  last_goal_date: null,
  last_freeze_date: null,
  xp_total: 0,
}

/** Latest day that kept the streak alive (goal met or frozen). */
export function lastCoveredDate(state: StreakState): string | null {
  return maxLocalDate(state.last_goal_date, state.last_freeze_date)
}

export type RolloverResult = {
  state: StreakState
  /** Missed days a freeze was spent on (persist as daily_activity.freeze_used). */
  freeze_dates: string[]
  broken: boolean
  changed: boolean
}

/**
 * Settle every *finished* day before `today`: a single missed day consumes a
 * freeze when one is banked; a longer gap (or no freeze) breaks the streak.
 * Today itself is never judged — it is still open.
 */
export function rolloverStreak(state: StreakState, today: string): RolloverResult {
  const covered = lastCoveredDate(state)
  if (state.current === 0 || !covered) {
    return { state, freeze_dates: [], broken: false, changed: false }
  }
  const missed = daysBetween(covered, today) - 1
  if (missed <= 0) return { state, freeze_dates: [], broken: false, changed: false }
  if (missed <= MAX_FREEZE_GAP && state.freezes >= missed) {
    const freezeDates = Array.from({ length: missed }, (_, i) => addDays(covered, i + 1))
    return {
      state: {
        ...state,
        freezes: state.freezes - missed,
        last_freeze_date: freezeDates[freezeDates.length - 1] ?? state.last_freeze_date,
      },
      freeze_dates: freezeDates,
      broken: false,
      changed: true,
    }
  }
  return {
    state: { ...state, current: 0 },
    freeze_dates: [],
    broken: true,
    changed: true,
  }
}

export type GoalMetResult = {
  state: StreakState
  /** False when the goal was already met today (idempotent). */
  extended: boolean
  freeze_earned: boolean
}

/**
 * Today's goal was met. Call after `rolloverStreak` for the same `today`.
 * Idempotent: a second call on the same day changes nothing.
 */
export function applyGoalMet(state: StreakState, today: string): GoalMetResult {
  if (state.last_goal_date === today) {
    return { state, extended: false, freeze_earned: false }
  }
  const covered = lastCoveredDate(state)
  const continues = covered !== null && state.current > 0 && daysBetween(covered, today) === 1
  const current = continues ? state.current + 1 : 1
  const earns = current % FREEZE_EARN_EVERY === 0 && state.freezes < MAX_FREEZES
  return {
    state: {
      ...state,
      current,
      longest: Math.max(state.longest, current),
      last_goal_date: today,
      freezes: earns ? state.freezes + 1 : state.freezes,
    },
    extended: true,
    freeze_earned: earns,
  }
}

export type StreakView = {
  current: number
  longest: number
  freezes: number
  goal_met_today: boolean
  /** Streak alive but today's goal still open. */
  at_risk: boolean
  /** A freeze would be (or was just) spent on yesterday. */
  freeze_pending: boolean
  last_covered_date: string | null
}

/** Read-side view for `today` without persisting anything. */
export function viewStreak(state: StreakState, today: string): StreakView {
  const rolled = rolloverStreak(state, today)
  const goalMetToday = rolled.state.last_goal_date === today
  return {
    current: rolled.state.current,
    longest: rolled.state.longest,
    freezes: rolled.state.freezes,
    goal_met_today: goalMetToday,
    at_risk: rolled.state.current > 0 && !goalMetToday,
    freeze_pending: rolled.freeze_dates.length > 0,
    last_covered_date: lastCoveredDate(rolled.state),
  }
}

/**
 * Stub-mode / legacy fallback: rebuild a streak from the set of goal-met local
 * dates (no freezes). Used when no stored streak row exists.
 */
export function streakFromGoalDates(dates: Iterable<string>, today: string): number {
  const days = new Set(dates)
  let cursor = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
