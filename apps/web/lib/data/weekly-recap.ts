/**
 * In-app weekly recap (DESIGN.md §16, pass 3) — the email-only Sunday recap
 * as a page section: this week so far (Monday-based, member's timezone) next
 * to last week, plus milestones closed this week and the league table.
 */
import { addDays } from "@/lib/local-day"

import { listAchievements, readDayHistory, readWeekCounts } from "./activity"
import { leagueWeek } from "./leagues"
import { getPrepProfile } from "./profile"

export type RecapDay = { date: string; goal_met: boolean; freeze_used: boolean; xp: number }

export type WeekTotals = {
  xp: number
  goal_days: number
  freeze_days: number
  graded_cards: number
  drills: number
  mocks: number
}

export type WeeklyRecap = {
  week_start: string
  week_end: string
  today: string
  days: RecapDay[]
  this_week: WeekTotals
  last_week: WeekTotals
  achievements: Array<{ id: string; title: string; earned_at: string | null }>
}

/** Seven calendar days from `weekStart`, filled from history. Pure. */
export function weekDays(weekStart: string, rows: RecapDay[]): RecapDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    return byDate.get(date) ?? { date, goal_met: false, freeze_used: false, xp: 0 }
  })
}

export function totalsFrom(rows: RecapDay[], counts: { graded_cards: number; drills: number; mocks: number }): WeekTotals {
  return {
    xp: rows.reduce((sum, row) => sum + row.xp, 0),
    goal_days: rows.filter((row) => row.goal_met).length,
    freeze_days: rows.filter((row) => row.freeze_used && !row.goal_met).length,
    ...counts,
  }
}

export async function getWeeklyRecap(options: { userId: string; now?: Date }): Promise<WeeklyRecap> {
  const { userId } = options
  const now = options.now ?? new Date()
  const { profile } = await getPrepProfile(userId)
  const week = leagueWeek(now, profile.timezone)
  const prevStart = addDays(week.weekStart, -7)
  const prevEnd = addDays(week.weekStart, -1)

  const [history, thisCounts, lastCounts, achievements] = await Promise.all([
    readDayHistory(userId, prevStart, week.weekEnd),
    readWeekCounts(userId, week.weekStart, week.weekEnd),
    readWeekCounts(userId, prevStart, prevEnd),
    listAchievements(userId),
  ])
  const rows: RecapDay[] = history.map(({ date, goal_met, freeze_used, xp }) => ({ date, goal_met, freeze_used, xp }))
  const thisRows = rows.filter((row) => row.date >= week.weekStart)
  const lastRows = rows.filter((row) => row.date < week.weekStart)
  const weekStartMs = Date.parse(`${week.weekStart}T00:00:00Z`) - 14 * 3_600_000 // earliest timezone offset

  return {
    week_start: week.weekStart,
    week_end: week.weekEnd,
    today: week.today,
    days: weekDays(week.weekStart, thisRows),
    this_week: totalsFrom(thisRows, thisCounts),
    last_week: totalsFrom(lastRows, lastCounts),
    achievements: achievements.items
      .filter((item) => item.earned_at && Date.parse(item.earned_at) >= weekStartMs)
      .map((item) => ({ id: item.id, title: item.title, earned_at: item.earned_at })),
  }
}
