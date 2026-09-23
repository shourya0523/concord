/**
 * Retention API envelopes (plan 2026-09-23-001 Phases 4–5):
 *   GET  /api/daily-set                → DailySetResponse
 *   POST /api/daily-set {complete}     → DailySetActionResponse
 *   GET  /api/today[?firm_id=…]        → TodayResponse
 *   GET  /api/placement                → PlacementResponse
 *   POST /api/placement {complete|skip}→ PlacementActionResponse
 *   GET  /api/achievements             → AchievementsResponse
 * Pure zod — safe to import from client islands for types.
 */
import { z } from "zod"
import {
  AchievementEarnedSchema,
  ActivityResultSchema,
  DrillInstanceSchema,
} from "@ibpe/contracts"

export const RetentionSourceSchema = z.enum(["published", "stub"])

export const DailySetItemKindEnum = z.enum(["review", "new", "firm_heat", "drill"])
export type DailySetItemKind = z.infer<typeof DailySetItemKindEnum>

export const DailySetItemSchema = z.object({
  /** `<kind>:<subject_id>` — unique within a set. */
  id: z.string(),
  kind: DailySetItemKindEnum,
  /** Canonical question id, or `drill:<template>:<seed>` for drills. */
  subject_id: z.string(),
  question_id: z.string().nullable().default(null),
  prompt: z.string(),
  topic: z.string().nullable().default(null),
  concept_id: z.string().nullable().default(null),
  firm_id: z.string().nullable().default(null),
  difficulty: z.string().nullable().default(null),
  /** Why this card is in today's set (shown on the card). */
  reason: z.string(),
  drill: DrillInstanceSchema.nullable().default(null),
  done_at: z.string().nullable().default(null),
  score: z.number().min(0).max(1).nullable().default(null),
})
export type DailySetItem = z.infer<typeof DailySetItemSchema>

export const DailySetSchema = z.object({
  local_date: z.string(),
  timezone: z.string(),
  goal: z.number().int().positive(),
  items: z.array(DailySetItemSchema),
  completed_count: z.number().int().nonnegative(),
  completed_at: z.string().nullable(),
  estimated_minutes: z.number().int().nonnegative(),
})
export type DailySet = z.infer<typeof DailySetSchema>

export const DailySetResponseSchema = z.object({
  set: DailySetSchema,
  source: RetentionSourceSchema,
  note: z.string().optional(),
})
export type DailySetResponse = z.infer<typeof DailySetResponseSchema>

export const DailySetActionRequestSchema = z.object({
  action: z.literal("complete"),
  item_id: z.string().min(1),
})
export type DailySetActionRequest = z.infer<typeof DailySetActionRequestSchema>

export const DailySetActionResponseSchema = z.object({
  set: DailySetSchema,
  item: DailySetItemSchema,
  /** Null when the item had already been recorded (e.g. by the attempts API). */
  activity: ActivityResultSchema.nullable(),
  source: RetentionSourceSchema,
})
export type DailySetActionResponse = z.infer<typeof DailySetActionResponseSchema>

export const ReadinessTopicSchema = z.object({
  topic: z.string(),
  concept_id: z.string(),
  weight: z.number().min(0),
  mastery: z.number().min(0).max(1),
  /** Occurrence sample behind the heat weight (always shown next to heat). */
  sample_size: z.number().int().nonnegative().default(0),
})

export const FirmReadinessSchema = z.object({
  firm_id: z.string(),
  firm_name: z.string(),
  /** 0–1; null when no heat topic maps to a concept yet. */
  readiness: z.number().min(0).max(1).nullable(),
  /** Change vs the snapshot a week ago (fraction, e.g. 0.07); null without history. */
  weekly_delta: z.number().nullable(),
  topics: z.array(ReadinessTopicSchema),
})
export type FirmReadiness = z.infer<typeof FirmReadinessSchema>

export const WarrenReadingSchema = z.object({
  state: z.enum(["celebrating", "streak_at_risk", "returning", "on_track", "fresh"]),
  mood: z.enum(["idle", "thinking", "encouraging", "celebrating", "concerned", "paused"]),
  message: z.string(),
})

export const TodayResponseSchema = z.object({
  local_date: z.string(),
  timezone: z.string(),
  local_hour: z.number().int().min(0).max(23),
  interview_date: z.string().nullable(),
  days_until_interview: z.number().int().nonnegative().nullable(),
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    freezes: z.number().int().nonnegative(),
    goal_met_today: z.boolean(),
    at_risk: z.boolean(),
    /** A freeze was spent on yesterday during this read. */
    freeze_used_yesterday: z.boolean(),
  }),
  xp: z.object({
    total: z.number().int().nonnegative(),
    today: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    level_floor: z.number().int().nonnegative(),
    next_level_at: z.number().int().positive(),
  }),
  daily_set: z.object({
    goal: z.number().int().positive(),
    completed: z.number().int().nonnegative(),
    total_items: z.number().int().nonnegative(),
    cards_done_today: z.number().int().nonnegative(),
    completed_at: z.string().nullable(),
    estimated_minutes: z.number().int().nonnegative(),
  }),
  readiness: z.array(FirmReadinessSchema),
  primary_firm_id: z.string().nullable(),
  warren: WarrenReadingSchema,
  achievements_earned: z.array(AchievementEarnedSchema),
  placement_completed_at: z.string().nullable(),
  flags: z.object({ daily_set: z.boolean(), gamification: z.boolean() }),
  source: RetentionSourceSchema,
})
export type TodayResponse = z.infer<typeof TodayResponseSchema>

export const PlacementQuestionSchema = z.object({
  question_id: z.string(),
  prompt: z.string(),
  topic: z.string().nullable(),
  concept_id: z.string().nullable(),
  difficulty: z.string().nullable(),
})
export type PlacementQuestion = z.infer<typeof PlacementQuestionSchema>

export const PlacementResponseSchema = z.object({
  questions: z.array(PlacementQuestionSchema),
  completed_at: z.string().nullable(),
  source: z.enum(["published", "bank_fallback", "empty"]),
  note: z.string().optional(),
})
export type PlacementResponse = z.infer<typeof PlacementResponseSchema>

export const PlacementActionRequestSchema = z.object({
  action: z.enum(["complete", "skip"]),
  answered: z.number().int().nonnegative().max(50).optional(),
})

export const PlacementActionResponseSchema = z.object({
  completed_at: z.string(),
  skipped: z.boolean(),
})

export const AchievementRowSchema = AchievementEarnedSchema.extend({
  earned_at: z.string().nullable(),
})
export const AchievementsResponseSchema = z.object({
  earned: z.array(AchievementRowSchema),
  locked: z.array(AchievementEarnedSchema),
  source: RetentionSourceSchema,
})
export type AchievementsResponse = z.infer<typeof AchievementsResponseSchema>
