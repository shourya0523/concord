/**
 * Learning activity hook — every graded action (study attempt, numeric drill,
 * finished mock, placement check) reports here so streaks, XP, daily-set
 * progress and achievements update in one place (plan 2026-09-23-001 P5.2,
 * P5.3, P5.5, P5.6; KD-6).
 *
 * Callers must treat a null result as "retention off" and never fail the
 * attempt: this function never throws.
 *
 * Storage (migration 045 semantics, read by the notifications track):
 *   app.daily_activity  cards_done (goal-counting events today, local day),
 *                       goal (today's set goal), goal_met, xp (today),
 *                       freeze_used (a missed day covered by a freeze)
 *   app.user_streaks    current/longest streak of goal-met local days,
 *                       freezes (0..2), last_goal_date, xp_total
 *   app.daily_sets      completed_count / completed_at + per-item done_at
 *   app.activity_events ledger (054): XP repeat rule + achievement counters
 *   app.user_achievements
 */
import { randomUUID } from "node:crypto"
import type { AchievementEarned, ActivityKind, ActivityResult } from "@ibpe/contracts"
import { describeAchievement, evaluateAchievements, type ConceptStat } from "@/lib/achievements"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { withRlsUserId } from "@/lib/db/rls"
import { isFlagOn } from "@/lib/flags"
import { localDate, safeTimeZone } from "@/lib/local-day"
import { dailySetSize, getStubDailySet, markStubDailySetItem } from "./daily-set"
import { memoryStore } from "./memory-store"
import { getPrepProfile } from "./profile"
import { conceptStatsFrom, loadConceptMastery } from "./readiness"
import {
  EMPTY_STREAK,
  applyGoalMet,
  rolloverStreak,
  type RolloverResult,
  type StreakState,
} from "./streaks"
import { ensureAppUserQuery } from "./users"
import { DAILY_GOAL_BONUS, REPEAT_WINDOW_MS, xpForEvent } from "./xp"

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

/* ------------------------------------------------------------------ */
/* Pure planning                                                       */
/* ------------------------------------------------------------------ */

export type DailyActivityRow = {
  cards_done: number
  goal: number
  goal_met: boolean
  xp: number
  freeze_used: boolean
}

export type ActivityCounts = { graded_cards: number; drills: number; mocks: number }

export type ActivityReadState = {
  streak: StreakState
  today: DailyActivityRow | null
  /** Goal of today's frozen set, when one exists. */
  set_goal: number | null
  repeated: boolean
  counts: ActivityCounts
}

export type ActivityPlan = {
  today: string
  xp_event: number
  cards_inc: number
  goal: number
  rollover: RolloverResult
  /** Streak if this event is the one that meets today's goal. */
  streak_if_met: StreakState
  /** Predicted from the read state (the DB write decides atomically). */
  goal_met_now: boolean
  counts_after: ActivityCounts
}

/** Whether the event is a goal-counting card (mocks are not cards). */
export function countsAsCard(event: Pick<LearningActivityEvent, "kind" | "countsTowardGoal">): boolean {
  return event.countsTowardGoal && event.kind !== "mock_complete"
}

export function planActivity(
  read: ActivityReadState,
  event: Pick<LearningActivityEvent, "kind" | "score" | "scoreSource" | "countsTowardGoal">,
  today: string,
  fallbackGoal: number,
): ActivityPlan {
  const rollover = rolloverStreak(read.streak, today)
  // A card counts once per subject per 24 h: retrying the same question or
  // drill must not fill the daily goal on its own.
  const cardsInc = countsAsCard(event) && !read.repeated ? 1 : 0
  const goal = read.today?.goal_met ? read.today.goal : (read.set_goal ?? read.today?.goal ?? fallbackGoal)
  const cardsAfter = (read.today?.cards_done ?? 0) + cardsInc
  const goalMetNow = !read.today?.goal_met && cardsAfter >= goal && cardsInc > 0
  const graded = event.countsTowardGoal && event.score != null
  return {
    today,
    xp_event: xpForEvent({
      kind: event.kind,
      score: event.score,
      scoreSource: event.scoreSource,
      countsTowardGoal: event.countsTowardGoal,
      repeatedWithin24h: read.repeated,
    }),
    cards_inc: cardsInc,
    goal,
    rollover,
    streak_if_met: applyGoalMet(rollover.state, today).state,
    goal_met_now: goalMetNow,
    counts_after: {
      graded_cards:
        read.counts.graded_cards + (graded && (event.kind === "attempt" || event.kind === "placement") ? 1 : 0),
      drills: read.counts.drills + (event.kind === "drill" && event.countsTowardGoal ? 1 : 0),
      mocks: read.counts.mocks + (event.kind === "mock_complete" ? 1 : 0),
    },
  }
}

/* ------------------------------------------------------------------ */
/* In-memory store (DATABASE_URL unset)                                */
/* ------------------------------------------------------------------ */

type LedgerRow = {
  kind: ActivityKind | "goal_bonus"
  subject_id: string | null
  score: number | null
  counts_toward_goal: boolean
  xp: number
  local_date: string
  created_at: string
}

type AchievementRow = { id: string; earned_at: string; detail: AchievementEarned }

const stubStreaks = memoryStore<string, StreakState>("user_streaks")
const stubDaily = memoryStore<string, DailyActivityRow>("daily_activity")
const stubLedger = memoryStore<string, LedgerRow[]>("activity_events")
const stubAchievements = memoryStore<string, Map<string, AchievementRow>>("user_achievements")

const dayKey = (userId: string, day: string) => `${userId}|${day}`

function stubAchievementsFor(userId: string): Map<string, AchievementRow> {
  let rows = stubAchievements.get(userId)
  if (!rows) {
    rows = new Map()
    stubAchievements.set(userId, rows)
  }
  return rows
}

function stubCounts(userId: string): ActivityCounts {
  const rows = stubLedger.get(userId) ?? []
  return {
    graded_cards: rows.filter(
      (r) => (r.kind === "attempt" || r.kind === "placement") && r.counts_toward_goal && r.score != null,
    ).length,
    drills: rows.filter((r) => r.kind === "drill" && r.counts_toward_goal).length,
    mocks: rows.filter((r) => r.kind === "mock_complete").length,
  }
}

function stubRepeated(userId: string, subjectId: string | null | undefined, at: Date): boolean {
  if (!subjectId) return false
  const cutoff = at.getTime() - REPEAT_WINDOW_MS
  return (stubLedger.get(userId) ?? []).some(
    (r) =>
      r.subject_id === subjectId &&
      r.score != null &&
      r.counts_toward_goal &&
      Date.parse(r.created_at) > cutoff,
  )
}

function stubStreakState(userId: string): StreakState {
  return stubStreaks.get(userId) ?? EMPTY_STREAK
}

function applyStubRollover(userId: string, today: string, goal: number): RolloverResult {
  const rollover = rolloverStreak(stubStreakState(userId), today)
  if (rollover.changed) {
    stubStreaks.set(userId, rollover.state)
    for (const day of rollover.freeze_dates) {
      const key = dayKey(userId, day)
      const row = stubDaily.get(key)
      stubDaily.set(key, {
        cards_done: row?.cards_done ?? 0,
        goal: row?.goal ?? goal,
        goal_met: row?.goal_met ?? false,
        xp: row?.xp ?? 0,
        freeze_used: true,
      })
    }
  }
  return rollover
}

async function awardStub(userId: string, list: AchievementEarned[], at: string): Promise<AchievementEarned[]> {
  const rows = stubAchievementsFor(userId)
  const fresh = list.filter((a) => !rows.has(a.id))
  for (const achievement of fresh) rows.set(achievement.id, { id: achievement.id, earned_at: at, detail: achievement })
  return fresh
}

async function recordStub(
  event: LearningActivityEvent,
  today: string,
  fallbackGoal: number,
  at: Date,
  concepts: ConceptStat[],
): Promise<ActivityResult> {
  const { userId } = event
  const iso = at.toISOString()
  const set = getStubDailySet(userId, today)
  const read: ActivityReadState = {
    streak: stubStreakState(userId),
    today: stubDaily.get(dayKey(userId, today)) ?? null,
    set_goal: set?.goal ?? null,
    repeated: stubRepeated(userId, event.subjectId, at),
    counts: stubCounts(userId),
  }
  const plan = planActivity(read, event, today, fallbackGoal)
  applyStubRollover(userId, today, plan.goal)

  const key = dayKey(userId, today)
  const prev = stubDaily.get(key)
  const row: DailyActivityRow = {
    cards_done: (prev?.cards_done ?? 0) + plan.cards_inc,
    goal: prev?.goal_met ? prev.goal : plan.goal,
    goal_met: prev?.goal_met ?? false,
    xp: (prev?.xp ?? 0) + plan.xp_event,
    freeze_used: prev?.freeze_used ?? false,
  }
  let streak = stubStreakState(userId)
  let bonus = 0
  if (!row.goal_met && plan.cards_inc > 0 && row.cards_done >= row.goal) {
    row.goal_met = true
    bonus = DAILY_GOAL_BONUS
    row.xp += bonus
    streak = applyGoalMet(streak, today).state
  }
  streak = { ...streak, xp_total: streak.xp_total + plan.xp_event + bonus }
  stubDaily.set(key, row)
  stubStreaks.set(userId, streak)

  const ledger = stubLedger.get(userId) ?? []
  ledger.push({
    kind: event.kind,
    subject_id: event.subjectId ?? null,
    score: event.score,
    counts_toward_goal: event.countsTowardGoal,
    xp: plan.xp_event,
    local_date: today,
    created_at: iso,
  })
  if (bonus > 0) {
    ledger.push({
      kind: "goal_bonus",
      subject_id: null,
      score: null,
      counts_toward_goal: false,
      xp: bonus,
      local_date: today,
      created_at: iso,
    })
  }
  stubLedger.set(userId, ledger.slice(-5000))

  const marked =
    event.subjectId && countsAsCard(event)
      ? markStubDailySetItem(userId, today, event.subjectId, event.score, iso)
      : set

  const earned = await awardStub(
    userId,
    evaluateAchievements(
      { streak: { current: streak.current, longest: streak.longest }, ...plan.counts_after, concepts },
      stubAchievementsFor(userId).keys(),
    ),
    iso,
  )

  return {
    xp_awarded: plan.xp_event + bonus,
    xp_total: streak.xp_total,
    streak: {
      current: streak.current,
      longest: streak.longest,
      freezes: streak.freezes,
      goal_met_today: streak.last_goal_date === today,
      local_date: today,
    },
    daily_set: marked
      ? { completed: marked.completed_count, goal: marked.goal }
      : { completed: Math.min(row.cards_done, row.goal), goal: row.goal },
    achievements_earned: earned,
  }
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

type StreakRow = {
  current_streak: number
  longest_streak: number
  freezes: number
  last_goal_date: string | null
  xp_total: number
}

function toStreakState(row: StreakRow | undefined, lastFreeze: string | null): StreakState {
  if (!row) return { ...EMPTY_STREAK, last_freeze_date: lastFreeze }
  return {
    current: Number(row.current_streak),
    longest: Number(row.longest_streak),
    freezes: Number(row.freezes),
    last_goal_date: row.last_goal_date,
    last_freeze_date: lastFreeze,
    xp_total: Number(row.xp_total),
  }
}

type DbReadState = ActivityReadState & { earned: Set<string> }

async function readDbState(
  userId: string,
  today: string,
  subjectId: string | null | undefined,
  at: Date,
): Promise<DbReadState> {
  const sql = requireSql()
  const since = new Date(at.getTime() - REPEAT_WINDOW_MS).toISOString()
  const results = await withRlsUserId(sql, userId, (s) => [
    s`
      SELECT us.current_streak, us.longest_streak, us.freezes,
             us.last_goal_date::text AS last_goal_date, us.xp_total
      FROM app.user_streaks us
      JOIN app.users u ON u.id = us.user_id
      WHERE u.neon_auth_user_id = ${userId}
    `,
    s`
      SELECT max(da.local_date)::text AS last_freeze
      FROM app.daily_activity da
      JOIN app.users u ON u.id = da.user_id
      WHERE u.neon_auth_user_id = ${userId} AND da.freeze_used
    `,
    s`
      SELECT da.cards_done, da.goal, da.goal_met, da.xp, da.freeze_used
      FROM app.daily_activity da
      JOIN app.users u ON u.id = da.user_id
      WHERE u.neon_auth_user_id = ${userId} AND da.local_date = ${today}::date
    `,
    s`
      SELECT ds.goal
      FROM app.daily_sets ds
      JOIN app.users u ON u.id = ds.user_id
      WHERE u.neon_auth_user_id = ${userId} AND ds.local_date = ${today}::date
    `,
    s`
      SELECT count(*)::int AS n
      FROM app.activity_events e
      JOIN app.users u ON u.id = e.user_id
      WHERE u.neon_auth_user_id = ${userId}
        AND e.subject_id = ${subjectId ?? null}
        AND e.score IS NOT NULL
        AND e.counts_toward_goal
        AND e.created_at > ${since}::timestamptz
    `,
    s`
      SELECT
        count(*) FILTER (
          WHERE e.kind IN ('attempt', 'placement') AND e.counts_toward_goal AND e.score IS NOT NULL
        )::int AS graded_cards,
        count(*) FILTER (WHERE e.kind = 'drill' AND e.counts_toward_goal)::int AS drills,
        count(*) FILTER (WHERE e.kind = 'mock_complete')::int AS mocks
      FROM app.activity_events e
      JOIN app.users u ON u.id = e.user_id
      WHERE u.neon_auth_user_id = ${userId}
    `,
    s`
      SELECT a.achievement_id
      FROM app.user_achievements a
      JOIN app.users u ON u.id = a.user_id
      WHERE u.neon_auth_user_id = ${userId}
    `,
  ])
  const streakRow = ((results[0] ?? []) as StreakRow[])[0]
  const lastFreeze = ((results[1] ?? []) as Array<{ last_freeze: string | null }>)[0]?.last_freeze ?? null
  const todayRow = ((results[2] ?? []) as DailyActivityRow[])[0]
  const setRow = ((results[3] ?? []) as Array<{ goal: number }>)[0]
  const repeatedRow = ((results[4] ?? []) as Array<{ n: number }>)[0]
  const countsRow = ((results[5] ?? []) as ActivityCounts[])[0]
  const earnedRows = (results[6] ?? []) as Array<{ achievement_id: string }>
  return {
    streak: toStreakState(streakRow, lastFreeze),
    today: todayRow
      ? {
          cards_done: Number(todayRow.cards_done),
          goal: Number(todayRow.goal),
          goal_met: Boolean(todayRow.goal_met),
          xp: Number(todayRow.xp),
          freeze_used: Boolean(todayRow.freeze_used),
        }
      : null,
    set_goal: setRow ? Number(setRow.goal) : null,
    repeated: Boolean(subjectId) && Number(repeatedRow?.n ?? 0) > 0,
    counts: {
      graded_cards: Number(countsRow?.graded_cards ?? 0),
      drills: Number(countsRow?.drills ?? 0),
      mocks: Number(countsRow?.mocks ?? 0),
    },
    earned: new Set(earnedRows.map((row) => row.achievement_id)),
  }
}

type SqlClient = ReturnType<typeof requireSql>

function userIdSubquery(s: SqlClient, userId: string) {
  return s`(SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)`
}

/** Persist a rollover (freeze spend or streak break) on its own. */
function rolloverQueries(s: SqlClient, userId: string, read: StreakState, rollover: RolloverResult, goal: number) {
  if (!rollover.changed) return []
  const uid = userIdSubquery(s, userId)
  return [
    ...rollover.freeze_dates.map(
      (day) => s`
        INSERT INTO app.daily_activity (user_id, local_date, goal, freeze_used)
        VALUES (${uid}, ${day}::date, ${goal}, true)
        ON CONFLICT (user_id, local_date) DO UPDATE SET freeze_used = true, updated_at = now()
      `,
    ),
    s`
      INSERT INTO app.user_streaks AS us (user_id, current_streak, longest_streak, freezes, last_goal_date, xp_total)
      VALUES (${uid}, ${rollover.state.current}, ${rollover.state.longest}, ${rollover.state.freezes},
              ${rollover.state.last_goal_date}::date, ${rollover.state.xp_total})
      ON CONFLICT (user_id) DO UPDATE SET
        current_streak = CASE
          WHEN us.last_goal_date IS NOT DISTINCT FROM ${read.last_goal_date}::date THEN EXCLUDED.current_streak
          ELSE us.current_streak END,
        freezes = CASE
          WHEN us.last_goal_date IS NOT DISTINCT FROM ${read.last_goal_date}::date
               AND us.freezes = ${read.freezes} THEN EXCLUDED.freezes
          ELSE us.freezes END,
        updated_at = now()
    `,
  ]
}

async function recordDb(
  event: LearningActivityEvent,
  today: string,
  fallbackGoal: number,
  at: Date,
  concepts: ConceptStat[],
): Promise<ActivityResult> {
  const { userId, email } = event
  const read = await readDbState(userId, today, event.subjectId, at)
  const plan = planActivity(read, event, today, fallbackGoal)
  const rolled = plan.rollover.state
  const met = plan.streak_if_met
  const iso = at.toISOString()
  const markSubject = event.subjectId && countsAsCard(event) ? event.subjectId : null
  const score = event.score == null ? null : Math.min(1, Math.max(0, event.score))

  const sql = requireSql()
  const results = await withRlsUserId(sql, userId, (s) => {
    const uid = userIdSubquery(s, userId)
    return [
      ensureAppUserQuery(s, userId, email),
      ...rolloverQueries(s, userId, read.streak, plan.rollover, plan.goal),
      s`
        INSERT INTO app.daily_activity (user_id, local_date, cards_done, goal, xp)
        VALUES (${uid}, ${today}::date, ${plan.cards_inc}, ${plan.goal}, ${plan.xp_event})
        ON CONFLICT (user_id, local_date) DO UPDATE SET
          cards_done = app.daily_activity.cards_done + ${plan.cards_inc},
          xp = app.daily_activity.xp + ${plan.xp_event},
          goal = CASE WHEN app.daily_activity.goal_met THEN app.daily_activity.goal ELSE EXCLUDED.goal END,
          updated_at = now()
      `,
      s`
        UPDATE app.daily_sets ds SET
          items_json = COALESCE((
            SELECT jsonb_agg(
              CASE
                WHEN t.ord = (
                  SELECT min(t2.ord) FROM jsonb_array_elements(ds.items_json) WITH ORDINALITY AS t2(elem, ord)
                  WHERE t2.elem ->> 'subject_id' = ${markSubject}
                    AND COALESCE(t2.elem ->> 'done_at', '') = ''
                )
                THEN t.elem || jsonb_build_object('done_at', ${iso}::text, 'score', ${score}::double precision)
                ELSE t.elem
              END
              ORDER BY t.ord
            )
            FROM jsonb_array_elements(ds.items_json) WITH ORDINALITY AS t(elem, ord)
          ), ds.items_json),
          updated_at = now()
        WHERE ds.user_id = ${uid} AND ds.local_date = ${today}::date AND ${markSubject}::text IS NOT NULL
      `,
      s`
        UPDATE app.daily_sets ds SET
          completed_count = done.n,
          completed_at = CASE
            WHEN done.n >= jsonb_array_length(ds.items_json) AND jsonb_array_length(ds.items_json) > 0
              THEN COALESCE(ds.completed_at, ${iso}::timestamptz)
            ELSE ds.completed_at END
        FROM (
          SELECT count(*)::int AS n
          FROM app.daily_sets d2, jsonb_array_elements(d2.items_json) AS e(elem)
          WHERE d2.user_id = ${uid} AND d2.local_date = ${today}::date
            AND COALESCE(e.elem ->> 'done_at', '') <> ''
        ) AS done
        WHERE ds.user_id = ${uid} AND ds.local_date = ${today}::date
        RETURNING ds.completed_count, ds.goal
      `,
      s`
        WITH met AS (
          UPDATE app.daily_activity SET goal_met = true, xp = xp + ${DAILY_GOAL_BONUS}, updated_at = now()
          WHERE user_id = ${uid} AND local_date = ${today}::date AND NOT goal_met AND cards_done >= goal
          RETURNING 1
        )
        INSERT INTO app.user_streaks AS us
          (user_id, current_streak, longest_streak, freezes, last_goal_date, xp_total, updated_at)
        VALUES (
          ${uid},
          CASE WHEN EXISTS (SELECT 1 FROM met) THEN ${met.current}::int ELSE ${rolled.current}::int END,
          CASE WHEN EXISTS (SELECT 1 FROM met) THEN ${met.longest}::int ELSE ${rolled.longest}::int END,
          CASE WHEN EXISTS (SELECT 1 FROM met) THEN ${met.freezes}::int ELSE ${rolled.freezes}::int END,
          CASE WHEN EXISTS (SELECT 1 FROM met) THEN ${today}::date ELSE ${rolled.last_goal_date}::date END,
          ${plan.xp_event}::int + (SELECT count(*)::int FROM met) * ${DAILY_GOAL_BONUS}::int,
          now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          current_streak = CASE WHEN EXISTS (SELECT 1 FROM met) THEN EXCLUDED.current_streak ELSE us.current_streak END,
          longest_streak = GREATEST(us.longest_streak, EXCLUDED.longest_streak),
          freezes = CASE WHEN EXISTS (SELECT 1 FROM met) THEN EXCLUDED.freezes ELSE us.freezes END,
          last_goal_date = CASE WHEN EXISTS (SELECT 1 FROM met) THEN EXCLUDED.last_goal_date ELSE us.last_goal_date END,
          xp_total = us.xp_total + EXCLUDED.xp_total,
          updated_at = now()
        RETURNING us.current_streak, us.longest_streak, us.freezes,
                  us.last_goal_date::text AS last_goal_date, us.xp_total,
                  (SELECT count(*)::int FROM met) AS goal_met_now
      `,
      s`
        INSERT INTO app.activity_events
          (id, user_id, kind, subject_id, score, score_source, counts_toward_goal, xp, local_date, created_at)
        VALUES (
          ${`act_${randomUUID().replace(/-/g, "").slice(0, 24)}`}, ${uid}, ${event.kind},
          ${event.subjectId ?? null}, ${score}, ${event.scoreSource}, ${event.countsTowardGoal},
          ${plan.xp_event}, ${today}::date, ${iso}::timestamptz
        )
      `,
      s`
        INSERT INTO app.activity_events (id, user_id, kind, xp, local_date, created_at)
        SELECT ${`act_${randomUUID().replace(/-/g, "").slice(0, 24)}`}, ${uid}, 'goal_bonus',
               ${DAILY_GOAL_BONUS}, ${today}::date, ${iso}::timestamptz
        WHERE EXISTS (
          SELECT 1 FROM app.daily_activity
          WHERE user_id = ${uid} AND local_date = ${today}::date AND goal_met
        )
        AND NOT EXISTS (
          SELECT 1 FROM app.activity_events
          WHERE user_id = ${uid} AND local_date = ${today}::date AND kind = 'goal_bonus'
        )
      `,
      s`
        SELECT da.cards_done, da.goal
        FROM app.daily_activity da
        WHERE da.user_id = ${uid} AND da.local_date = ${today}::date
      `,
    ]
  })
  // Results are index-aligned with the batch (set_config already stripped).
  const offset = 1 + (plan.rollover.changed ? plan.rollover.freeze_dates.length + 1 : 0)
  const setRow = ((results[offset + 2] ?? []) as Array<{ completed_count: number; goal: number }>)[0]
  const streakRow = ((results[offset + 3] ?? []) as Array<StreakRow & { goal_met_now: number }>)[0]
  const dayRow = ((results[offset + 6] ?? []) as Array<{ cards_done: number; goal: number }>)[0]

  const streak = toStreakState(streakRow, plan.rollover.state.last_freeze_date)
  const bonus = Number(streakRow?.goal_met_now ?? 0) > 0 ? DAILY_GOAL_BONUS : 0

  const candidates = evaluateAchievements(
    { streak: { current: streak.current, longest: streak.longest }, ...plan.counts_after, concepts },
    read.earned,
  )
  const earned = await awardAchievements({ userId, email, achievements: candidates })

  return {
    xp_awarded: plan.xp_event + bonus,
    xp_total: streak.xp_total,
    streak: {
      current: streak.current,
      longest: streak.longest,
      freezes: streak.freezes,
      goal_met_today: streak.last_goal_date === today,
      local_date: today,
    },
    daily_set: setRow
      ? { completed: Number(setRow.completed_count), goal: Number(setRow.goal) }
      : dayRow
        ? { completed: Math.min(Number(dayRow.cards_done), Number(dayRow.goal)), goal: Number(dayRow.goal) }
        : null,
    achievements_earned: earned,
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function retentionEnabled(): boolean {
  return isFlagOn("gamification") || isFlagOn("daily_set")
}

/**
 * Record one learning event: daily progress, streak, XP, set item, achievements.
 * Never throws; null means retention is off or storage failed.
 */
export async function recordLearningActivity(
  event: LearningActivityEvent,
): Promise<ActivityResult | null> {
  try {
    if (!retentionEnabled() || !event.userId) return null
    const at = event.at ?? new Date()
    const { profile } = await getPrepProfile(event.userId)
    const timezone = safeTimeZone(profile.timezone)
    const today = localDate(at, timezone)
    const fallbackGoal = dailySetSize(profile.availability_minutes)
    const concepts =
      event.kind === "attempt" || event.kind === "placement"
        ? conceptStatsFrom(await loadConceptMastery(event.userId))
        : []
    if (!isDatabaseConfigured()) {
      return await recordStub(event, today, fallbackGoal, at, concepts)
    }
    return await recordDb(event, today, fallbackGoal, at, concepts)
  } catch (err) {
    console.warn("[activity] recordLearningActivity failed; retention skipped", err)
    return null
  }
}

/** Store achievements; returns only the ones newly earned. */
export async function awardAchievements(options: {
  userId: string
  email?: string | null
  achievements: AchievementEarned[]
  at?: Date
}): Promise<AchievementEarned[]> {
  const { userId, email, achievements } = options
  if (achievements.length === 0) return []
  const iso = (options.at ?? new Date()).toISOString()
  if (!isDatabaseConfigured()) return awardStub(userId, achievements, iso)
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      ...achievements.map(
        (achievement) => s`
          INSERT INTO app.user_achievements (user_id, achievement_id, earned_at, detail_json)
          VALUES (
            (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
            ${achievement.id}, ${iso}::timestamptz, ${JSON.stringify(achievement)}::jsonb
          )
          ON CONFLICT (user_id, achievement_id) DO NOTHING
          RETURNING achievement_id
        `,
      ),
    ])
    const inserted = new Set(
      results.slice(1).flatMap((rows) => ((rows ?? []) as Array<{ achievement_id: string }>).map((r) => r.achievement_id)),
    )
    return achievements.filter((achievement) => inserted.has(achievement.id))
  } catch (err) {
    console.warn("[activity] achievement write failed", err)
    return []
  }
}

export type EarnedAchievement = AchievementEarned & { earned_at: string | null }

export async function listAchievements(userId: string): Promise<{
  items: EarnedAchievement[]
  source: "published" | "stub"
}> {
  const fromStub = () =>
    [...stubAchievementsFor(userId).values()]
      .sort((a, b) => b.earned_at.localeCompare(a.earned_at))
      .map((row) => ({ ...describeAchievement(row.id, row.detail), earned_at: row.earned_at }))
  if (!isDatabaseConfigured()) return { items: fromStub(), source: "stub" }
  try {
    const sql = requireSql()
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT a.achievement_id, a.earned_at, a.detail_json
        FROM app.user_achievements a
        JOIN app.users u ON u.id = a.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY a.earned_at DESC
      `,
    ])
    const rows = (results[0] ?? []) as Array<{
      achievement_id: string
      earned_at: string
      detail_json: Record<string, unknown> | null
    }>
    return {
      items: rows.map((row) => ({
        ...describeAchievement(row.achievement_id, row.detail_json),
        earned_at: new Date(row.earned_at).toISOString(),
      })),
      source: "published",
    }
  } catch (err) {
    console.warn("[activity] achievements read failed", err)
    return { items: fromStub(), source: "stub" }
  }
}

export type RetentionState = {
  today: string
  timezone: string
  streak: StreakState
  rollover: RolloverResult
  day: DailyActivityRow | null
  source: "published" | "stub"
}

/**
 * Current streak/XP/day state for `now`, settling finished days lazily
 * (spends a freeze on a single missed day, or ends a lapsed streak) — the
 * P5.3 "auto-applied on next visit" rule. Safe to call on every page view.
 */
export async function getRetentionState(options: {
  userId: string
  email?: string | null
  now?: Date
  timezone?: string | null
}): Promise<RetentionState> {
  const now = options.now ?? new Date()
  let timezone = options.timezone ?? null
  let goal = 8
  if (!timezone) {
    const { profile } = await getPrepProfile(options.userId)
    timezone = profile.timezone
    goal = dailySetSize(profile.availability_minutes)
  }
  const tz = safeTimeZone(timezone)
  const today = localDate(now, tz)
  const { userId } = options

  if (!isDatabaseConfigured()) {
    const rollover = applyStubRollover(userId, today, goal)
    return {
      today,
      timezone: tz,
      streak: rollover.state,
      rollover,
      day: stubDaily.get(dayKey(userId, today)) ?? null,
      source: "stub",
    }
  }

  try {
    const read = await readDbState(userId, today, null, now)
    const rollover = rolloverStreak(read.streak, today)
    if (rollover.changed) {
      const sql = requireSql()
      await withRlsUserId(sql, userId, (s) => [
        ensureAppUserQuery(s, userId, options.email),
        ...rolloverQueries(s, userId, read.streak, rollover, read.set_goal ?? read.today?.goal ?? goal),
      ])
    }
    return {
      today,
      timezone: tz,
      streak: rollover.state,
      rollover,
      day: read.today,
      source: "published",
    }
  } catch (err) {
    console.warn("[activity] retention state read failed", err)
    return {
      today,
      timezone: tz,
      streak: EMPTY_STREAK,
      rollover: { state: EMPTY_STREAK, freeze_dates: [], broken: false, changed: false },
      day: null,
      source: "stub",
    }
  }
}

/** Goal-met local dates from the in-memory store (stub progress fallback). */
export function stubGoalDates(userId: string): string[] {
  const prefix = `${userId}|`
  return [...stubDaily.entries()]
    .filter(([key, row]) => key.startsWith(prefix) && row.goal_met)
    .map(([key]) => key.slice(prefix.length))
}

/** True once the in-memory engine has recorded anything for the user. */
export function hasStubActivity(userId: string): boolean {
  return (stubLedger.get(userId) ?? []).length > 0 || stubStreaks.has(userId)
}
