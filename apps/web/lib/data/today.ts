/**
 * Today home payload (plan 2026-09-23-001 P4.4): countdown, streak + freezes,
 * XP, daily-set progress, readiness hero with weekly delta per target firm,
 * and Warren's mood. Reading Today also settles finished days (freeze spend /
 * streak end) and snapshots readiness for the weekly trend.
 */
import type { TodayResponse } from "@/lib/api/retention-schemas"
import { satisfiedAchievements } from "@/lib/achievements"
import { isFlagOn } from "@/lib/flags"
import { addDays, daysBetween, daysUntil, localHour } from "@/lib/local-day"
import { warrenMoodFor } from "@/lib/warren-mood"
import { awardAchievements, getRetentionState } from "./activity"
import { dailySetSize, getOrCreateDailySet, readDailySet, safeTargetFirms } from "./daily-set"
import { getPrepProfile } from "./profile"
import { conceptStatsFrom, getFirmReadiness, loadConceptMastery } from "./readiness"
import { lastCoveredDate, viewStreak } from "./streaks"
import { levelForXp } from "./xp"

export async function getToday(options: {
  userId: string
  email?: string | null
  firmIds?: string[]
  now?: Date
}): Promise<TodayResponse> {
  const now = options.now ?? new Date()
  const { userId, email } = options
  const flags = { daily_set: isFlagOn("daily_set"), gamification: isFlagOn("gamification") }
  const { profile } = await getPrepProfile(userId)

  const state = await getRetentionState({ userId, email, now, timezone: profile.timezone })
  const { today, timezone } = state

  const setResponse = flags.daily_set
    ? await getOrCreateDailySet({ userId, email, now })
    : await readDailySet(userId, today, timezone)

  const targets = await safeTargetFirms(userId)
  const firmIds = options.firmIds && options.firmIds.length > 0 ? options.firmIds : targets.firmIds
  const mastery = await loadConceptMastery(userId)
  const readiness = await getFirmReadiness({ userId, email, firmIds, today, mastery })

  // Readiness + concept milestones are evaluated here, where readiness exists.
  const earned = flags.gamification
    ? await awardAchievements({
        userId,
        email,
        achievements: satisfiedAchievements({
          streak: { current: 0, longest: 0 },
          graded_cards: 0,
          drills: 0,
          mocks: 0,
          concepts: conceptStatsFrom(mastery),
          firms: readiness.map((row) => ({
            firm_id: row.firm_id,
            firm_name: row.firm_name,
            readiness: row.readiness,
          })),
        }),
        at: now,
      })
    : []

  const streak = viewStreak(state.streak, today)
  const covered = lastCoveredDate(state.streak)
  const set = setResponse?.set ?? null
  const goal = set?.goal ?? state.day?.goal ?? dailySetSize(profile.availability_minutes)
  const cardsDone = state.day?.cards_done ?? 0
  const completed = set?.completed_count ?? 0
  const hour = localHour(now, timezone)
  const level = levelForXp(state.streak.xp_total)

  return {
    local_date: today,
    timezone,
    local_hour: hour,
    interview_date: profile.interview_date,
    days_until_interview: daysUntil(profile.interview_date, today),
    streak: {
      current: streak.current,
      longest: streak.longest,
      freezes: streak.freezes,
      goal_met_today: streak.goal_met_today,
      at_risk: streak.at_risk,
      freeze_used_yesterday: state.rollover.freeze_dates.includes(addDays(today, -1)),
    },
    xp: {
      total: state.streak.xp_total,
      today: state.day?.xp ?? 0,
      level: level.level,
      level_floor: level.floor,
      next_level_at: level.next,
    },
    daily_set: {
      goal,
      completed,
      total_items: set?.items.length ?? 0,
      cards_done_today: cardsDone,
      completed_at: set?.completed_at ?? null,
      estimated_minutes: set?.estimated_minutes ?? Math.round(goal * 1.5),
    },
    readiness,
    primary_firm_id: firmIds[0] ?? targets.primaryFirmId,
    warren: warrenMoodFor({
      goalMetToday: streak.goal_met_today,
      streakCurrent: streak.current,
      longestStreak: streak.longest,
      localHour: hour,
      daysSinceCovered: covered ? daysBetween(covered, today) : null,
      justEarned: earned.length,
      cardsLeft: Math.max(0, goal - Math.max(completed, cardsDone)),
    }),
    achievements_earned: earned,
    placement_completed_at: profile.placement_completed_at,
    flags,
    source: state.source,
  }
}
