"use client"

import Link from "next/link"

import type { ActivityResult } from "@ibpe/contracts"
import { cn } from "@ibpe/ui/lib/utils"

import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { tombstoneFace } from "@/lib/achievements"

import { FiledStamp } from "./filed-stamp"
import { Paperclip } from "./paperclip"
import { PromotionMemo } from "./promotion-memo"
import { Tombstone } from "./tombstone"

/** Streak lengths that earn a handwritten headline. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365] as const

export function isStreakMilestone(activity: ActivityResult): boolean {
  const current = activity.streak?.current ?? 0
  return Boolean(activity.goal_met_now) && (STREAK_MILESTONES as readonly number[]).includes(current)
}

/**
 * Rewards after one graded action, under the ceremony budget (DESIGN.md §16):
 * routine wins get a calm margin note; the goal gets a stamp; a freeze gets a
 * paperclip; streak milestones get a handwritten headline; achievements are
 * tombstones placed on the shelf; a level-up is the promotion-memo hero (the
 * only burst here). Everything renders from server-confirmed `activity`.
 */
export function ActivityReward({
  activity,
  seedKey,
  className,
  quiet = false,
}: {
  activity: ActivityResult
  seedKey: string
  className?: string
  /** Routine line only (e.g. inside a compact drill result). */
  quiet?: boolean
}) {
  const xp = activity.xp_awarded ?? 0
  const streak = activity.streak
  const daily = activity.daily_set
  const achievements = activity.achievements_earned ?? []
  const goalNow = Boolean(activity.goal_met_now)
  const levelUp = activity.level_up ?? null
  const milestone = isStreakMilestone(activity)

  const routine = (
    <p
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums"
      aria-live="polite"
      data-testid="activity-margin"
    >
      {xp > 0 ? (
        <span className="motion-fade-late text-streak-foreground">
          +{xp} XP{activity.xp_total != null ? ` · ${activity.xp_total} total` : ""}
        </span>
      ) : null}
      {daily ? (
        <span>
          Today {Math.min(daily.completed, daily.goal)}/{daily.goal}
        </span>
      ) : null}
      {streak && streak.current > 0 ? (
        <span>
          {streak.current}-day run{streak.goal_met_today ? " · goal met" : ""}
        </span>
      ) : null}
    </p>
  )

  if (quiet) return <div className={className}>{routine}</div>
  if (xp <= 0 && !streak && !daily && achievements.length === 0 && !levelUp) return null

  return (
    <div className={cn("space-y-4", className)} aria-label="Progress this attempt">
      {routine}

      {goalNow ? (
        <div className="flex flex-wrap items-center gap-4">
          <FiledStamp localDate={streak?.local_date ?? new Date().toISOString().slice(0, 10)} play />
          <p className="text-sm text-muted-foreground">
            Today&apos;s goal met{streak ? ` · day ${streak.current} on the calendar` : ""}.
          </p>
        </div>
      ) : null}

      {activity.freeze_earned ? (
        <div className="flex items-center gap-3" data-testid="freeze-earned">
          <Paperclip slide />
          <p className="text-sm text-muted-foreground">
            A streak freeze, held in reserve. It covers one missed day.
          </p>
        </div>
      ) : null}

      {milestone && streak ? <HandwritingHeadline phrase={`${streak.current} days running`} /> : null}

      {achievements.length > 0 ? (
        <div className="space-y-2">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3" aria-label="Achievements earned">
            {achievements.map((achievement) => {
              const face = tombstoneFace(achievement)
              return (
                <li key={achievement.id}>
                  <Tombstone
                    id={achievement.id}
                    face={face.face}
                    what={face.what}
                    earnedAt={new Date().toISOString()}
                    compact
                    place
                  />
                </li>
              )
            })}
          </ul>
          <Link href="/achievements" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            See the shelf →
          </Link>
        </div>
      ) : null}

      {levelUp ? (
        <PromotionMemo
          seedKey={`${seedKey}-${levelUp.to}`}
          title={levelUp.to_title ?? `Level ${levelUp.to}`}
          previousTitle={levelUp.from_title ?? `level ${levelUp.from}`}
          xpTotal={activity.xp_total}
        />
      ) : null}
    </div>
  )
}
