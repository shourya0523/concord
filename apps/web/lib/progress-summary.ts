/**
 * Pure progress aggregation — mirrors the SQL in lib/data/progress.ts so the
 * in-memory path (no DATABASE_URL) reports the same shape and semantics.
 */

export type AttemptFact = { created_at: string; correct: boolean | null }

const DAY_MS = 24 * 60 * 60 * 1000

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Monday of the ISO week (UTC), like Postgres `date_trunc('week', …)`. */
export function weekStart(date: Date): string {
  const day = date.getUTCDay() || 7
  return isoDate(new Date(date.getTime() - (day - 1) * DAY_MS))
}

/** Consecutive active days ending today (or yesterday if today is idle). */
export function streakFromDates(dates: string[], now: Date = new Date()): number {
  if (dates.length === 0) return 0
  const days = new Set(dates)
  let streak = 0
  const cursor = new Date(now)
  if (!days.has(isoDate(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  while (days.has(isoDate(cursor))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

export function summariseAttempts(attempts: AttemptFact[], now: Date = new Date()) {
  const activityCutoff = now.getTime() - 28 * DAY_MS
  const accuracyCutoff = now.getTime() - 84 * DAY_MS
  const byDay = new Map<string, number>()
  const byWeek = new Map<string, { attempts: number; correct: number }>()

  for (const attempt of attempts) {
    const at = new Date(attempt.created_at)
    const ms = at.getTime()
    if (Number.isNaN(ms)) continue
    if (ms >= activityCutoff) {
      const day = isoDate(at)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    if (ms >= accuracyCutoff && attempt.correct !== null) {
      const week = weekStart(at)
      const bucket = byWeek.get(week) ?? { attempts: 0, correct: 0 }
      bucket.attempts += 1
      if (attempt.correct) bucket.correct += 1
      byWeek.set(week, bucket)
    }
  }

  const activity = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, attempts: count }))
  const accuracy = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, bucket]) => ({
      week,
      attempts: bucket.attempts,
      accuracy: bucket.correct / bucket.attempts,
    }))

  return {
    activity,
    accuracy,
    streak_days: streakFromDates(
      activity.map((row) => row.date),
      now,
    ),
    total_attempts: attempts.length,
  }
}

/** Toggle one checkpoint and recompute completion against the module's list. */
export function applyCheckpoint(
  completed: string[],
  checkpointIds: string[],
  checkpointId: string,
  complete: boolean,
): { completed_checkpoint_ids: string[]; percent: number } {
  const valid = new Set(checkpointIds)
  const next = new Set(completed.filter((id) => valid.has(id)))
  if (complete) next.add(checkpointId)
  else next.delete(checkpointId)
  // Keep roadmap order so the list reads naturally.
  const ordered = checkpointIds.filter((id) => next.has(id))
  const percent =
    checkpointIds.length === 0 ? 0 : Math.round((ordered.length / checkpointIds.length) * 100)
  return { completed_checkpoint_ids: ordered, percent }
}
