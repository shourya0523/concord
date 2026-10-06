/**
 * Tombstone shelf (DESIGN.md §16): earned achievements plus locked ones with
 * the distance left, so concept and firm-readiness goals are visible before
 * they are earned. Loading the shelf also evaluates (and awards) every
 * achievement — readiness milestones are no longer checked only on Today.
 */
import type { AchievementEarned } from "@ibpe/contracts"

import {
  achievementCatalogue,
  conceptCleared,
  satisfiedAchievements,
  CONCEPT_CLEARED_MIN_ATTEMPTED,
  type AchievementContext,
} from "@/lib/achievements"
import { isFlagOn } from "@/lib/flags"
import { topicLabel } from "@/lib/topics"

import { awardAchievements, getRetentionState, listAchievements, readLifetimeCounts, type EarnedAchievement } from "./activity"
import { safeTargetFirms } from "./daily-set"
import { conceptStatsFrom, getFirmReadiness, loadConceptMastery } from "./readiness"

export type LockedAchievement = AchievementEarned & {
  /** 0–1 toward unlocking; null when there's no meaningful measure. */
  progress: number | null
  progress_label: string | null
}

const STREAK_TARGETS: Record<string, number> = { streak_3: 3, streak_7: 7, streak_30: 30 }
const GRADED_TARGETS: Record<string, number> = { graded_10: 10, graded_100: 100 }
/** Locked concept / readiness tombstones shown at most (nearest first). */
export const MAX_DYNAMIC_LOCKED = 6

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/** Locked achievements with progress, given the full context. Pure. */
export function lockedShelf(ctx: AchievementContext, earnedIds: Iterable<string>): LockedAchievement[] {
  const earned = new Set(earnedIds)
  const out: LockedAchievement[] = []

  for (const item of achievementCatalogue()) {
    if (earned.has(item.id)) continue
    let progress: number | null = null
    let label: string | null = null
    if (item.id in STREAK_TARGETS) {
      const target = STREAK_TARGETS[item.id]!
      const best = Math.max(ctx.streak.current, ctx.streak.longest)
      progress = Math.min(1, best / target)
      label = `${plural(Math.max(0, target - ctx.streak.current), "day")} to go`
    } else if (item.id in GRADED_TARGETS) {
      const target = GRADED_TARGETS[item.id]!
      progress = Math.min(1, ctx.graded_cards / target)
      label = `${Math.max(0, target - ctx.graded_cards)} to go`
    } else if (item.id === "first_drill") {
      progress = 0
      label = "One numeric drill"
    } else if (item.id === "first_mock") {
      progress = 0
      label = "One full mock"
    }
    out.push({ ...item, progress, progress_label: label })
  }

  const dynamic: LockedAchievement[] = []
  for (const stat of ctx.concepts ?? []) {
    const id = `concept_cleared:${stat.concept_id}`
    if (earned.has(id) || stat.attempted === 0 || conceptCleared(stat)) continue
    const name = stat.title?.trim() || (stat.topic ? topicLabel(stat.topic) : stat.concept_id)
    const need = Math.max(stat.attempted, CONCEPT_CLEARED_MIN_ATTEMPTED)
    dynamic.push({
      id,
      title: `${name} cleared`,
      description: `Every attempted ${name} question at proficient or better (${CONCEPT_CLEARED_MIN_ATTEMPTED}+ attempted).`,
      progress: stat.proficient / need,
      progress_label: `${stat.proficient}/${need} proficient`,
    })
  }
  for (const firm of ctx.firms ?? []) {
    if (firm.readiness == null) continue
    const name = firm.firm_name?.trim() || firm.firm_id
    for (const level of [50, 80]) {
      const id = `readiness_${level}:${firm.firm_id}`
      const threshold = level / 100
      if (earned.has(id) || firm.readiness + 1e-9 >= threshold) continue
      const points = Math.max(1, level - Math.round(firm.readiness * 100))
      dynamic.push({
        id,
        title: `${name} ${level}% ready`,
        description: `Readiness for ${name} reaches ${level}% across its heat-weighted topics.`,
        progress: firm.readiness / threshold,
        progress_label: `At ${Math.round(firm.readiness * 100)}% · ${points} points to go`,
      })
      break // only the next readiness level per firm
    }
  }
  dynamic.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
  return [...out, ...dynamic.slice(0, MAX_DYNAMIC_LOCKED)]
}

export type AchievementShelf = {
  earned: EarnedAchievement[]
  locked: LockedAchievement[]
  newly_earned: AchievementEarned[]
  source: "published" | "stub"
}

export async function getAchievementShelf(options: {
  userId: string
  email?: string | null
  now?: Date
}): Promise<AchievementShelf> {
  const { userId, email } = options
  const now = options.now ?? new Date()
  const [state, counts, mastery, targets] = await Promise.all([
    getRetentionState({ userId, email, now }),
    readLifetimeCounts(userId),
    loadConceptMastery(userId),
    safeTargetFirms(userId),
  ])
  const readiness = targets.firmIds.length
    ? await getFirmReadiness({ userId, email, firmIds: targets.firmIds, today: state.today, mastery, persist: false })
    : []
  const ctx: AchievementContext = {
    streak: { current: state.streak.current, longest: state.streak.longest },
    ...counts,
    concepts: conceptStatsFrom(mastery),
    firms: readiness.map((row) => ({ firm_id: row.firm_id, firm_name: row.firm_name, readiness: row.readiness })),
  }
  const newlyEarned = isFlagOn("gamification")
    ? await awardAchievements({ userId, email, achievements: satisfiedAchievements(ctx), at: now })
    : []
  const { items, source } = await listAchievements(userId)
  return {
    earned: items,
    locked: lockedShelf(ctx, items.map((item) => item.id)),
    newly_earned: newlyEarned,
    source,
  }
}
