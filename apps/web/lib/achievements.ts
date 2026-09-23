/**
 * Milestones (plan 2026-09-23-001 P5.6). Code-defined, evaluated after every
 * learning event (and after readiness is computed), stored once per user in
 * app.user_achievements. Pure — no server deps, safe for client islands.
 */
import type { AchievementEarned } from "@ibpe/contracts"

import { topicLabel } from "@/lib/topics"

export const PROFICIENT_THRESHOLD = 0.68
export const CONCEPT_CLEARED_MIN_ATTEMPTED = 3

type StaticAchievement = {
  id: string
  title: string
  description: string
  /** Earned when this returns true. */
  test: (ctx: AchievementContext) => boolean
}

export type ConceptStat = {
  concept_id: string
  topic: string | null
  title?: string | null
  /** Questions in the concept with at least one graded attempt. */
  attempted: number
  /** Of those, how many are at or above proficient mastery. */
  proficient: number
}

export type FirmReadinessStat = {
  firm_id: string
  firm_name?: string | null
  /** 0–1, null when the firm has no measurable topics. */
  readiness: number | null
}

export type AchievementContext = {
  streak: { current: number; longest: number }
  graded_cards: number
  drills: number
  mocks: number
  concepts?: ConceptStat[]
  firms?: FirmReadinessStat[]
}

const STATIC_ACHIEVEMENTS: StaticAchievement[] = [
  {
    id: "streak_3",
    title: "3-day streak",
    description: "Met your daily goal three days running.",
    test: (ctx) => Math.max(ctx.streak.current, ctx.streak.longest) >= 3,
  },
  {
    id: "streak_7",
    title: "7-day streak",
    description: "A full week of daily goals — you earned a streak freeze.",
    test: (ctx) => Math.max(ctx.streak.current, ctx.streak.longest) >= 7,
  },
  {
    id: "streak_30",
    title: "30-day streak",
    description: "A month of daily goals.",
    test: (ctx) => Math.max(ctx.streak.current, ctx.streak.longest) >= 30,
  },
  {
    id: "graded_10",
    title: "10 graded cards",
    description: "Ten answers graded against the teaching corpus.",
    test: (ctx) => ctx.graded_cards >= 10,
  },
  {
    id: "graded_100",
    title: "100 graded cards",
    description: "A hundred graded answers.",
    test: (ctx) => ctx.graded_cards >= 100,
  },
  {
    id: "first_drill",
    title: "First numeric drill",
    description: "Completed your first auto-graded numeric drill.",
    test: (ctx) => ctx.drills >= 1,
  },
  {
    id: "first_mock",
    title: "First mock interview",
    description: "Finished a full simulator mock.",
    test: (ctx) => ctx.mocks >= 1,
  },
]

const READINESS_LEVELS = [
  { key: "50", threshold: 0.5 },
  { key: "80", threshold: 0.8 },
] as const

function prettyId(id: string): string {
  return id.replace(/^(concept_|firm_)/, "").replace(/[-_]/g, " ")
}

/** True when every attempted question in the concept is ≥ proficient (≥3 attempted). */
export function conceptCleared(stat: ConceptStat): boolean {
  return stat.attempted >= CONCEPT_CLEARED_MIN_ATTEMPTED && stat.proficient >= stat.attempted
}

/** Every achievement the context satisfies (earned or not). */
export function satisfiedAchievements(ctx: AchievementContext): AchievementEarned[] {
  const out: AchievementEarned[] = STATIC_ACHIEVEMENTS.filter((a) => a.test(ctx)).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
  }))
  for (const stat of ctx.concepts ?? []) {
    if (!conceptCleared(stat)) continue
    const name = stat.title?.trim() || (stat.topic ? topicLabel(stat.topic) : prettyId(stat.concept_id))
    out.push({
      id: `concept_cleared:${stat.concept_id}`,
      title: `${name} cleared`,
      description: `All ${stat.attempted} attempted ${name} questions at proficient or better.`,
    })
  }
  for (const firm of ctx.firms ?? []) {
    if (firm.readiness == null) continue
    const name = firm.firm_name?.trim() || prettyId(firm.firm_id)
    for (const level of READINESS_LEVELS) {
      if (firm.readiness + 1e-9 < level.threshold) continue
      out.push({
        id: `readiness_${level.key}:${firm.firm_id}`,
        title: `${name} ${level.key}% ready`,
        description: `Readiness for ${name} reached ${level.key}% across its heat-weighted topics.`,
      })
    }
  }
  return out
}

/** Achievements newly earned (not in `earnedIds`). */
export function evaluateAchievements(
  ctx: AchievementContext,
  earnedIds: Iterable<string>,
): AchievementEarned[] {
  const earned = new Set(earnedIds)
  return satisfiedAchievements(ctx).filter((achievement) => !earned.has(achievement.id))
}

/** Display metadata for a stored achievement id (titles for dynamic ids need detail_json). */
export function describeAchievement(
  id: string,
  detail?: { title?: unknown; description?: unknown } | null,
): AchievementEarned {
  const title = typeof detail?.title === "string" ? detail.title : null
  const description = typeof detail?.description === "string" ? detail.description : undefined
  const known = STATIC_ACHIEVEMENTS.find((a) => a.id === id)
  if (known) return { id, title: title ?? known.title, description: description ?? known.description }
  const [kind, subject = ""] = id.split(":")
  if (kind === "concept_cleared") {
    return { id, title: title ?? `${prettyId(subject)} cleared`, description }
  }
  if (kind?.startsWith("readiness_")) {
    return { id, title: title ?? `${prettyId(subject)} ${kind.slice(10)}% ready`, description }
  }
  return { id, title: title ?? prettyId(id), description }
}

/** Static catalogue (for "locked" rows on Progress). */
export function achievementCatalogue(): AchievementEarned[] {
  return STATIC_ACHIEVEMENTS.map(({ id, title, description }) => ({ id, title, description }))
}
