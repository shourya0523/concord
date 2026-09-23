/**
 * Learning-loop contracts (plan 2026-09-23-001): answer rubrics, grader v2
 * output, numeric drills, and the activity result every graded action returns.
 *
 * Rubrics are teaching truth derived from the teaching answer (ADR 0002):
 * Glassdoor text never becomes a key point, red flag or expected value.
 */
import { z } from "zod";

export const RUBRIC_VERSION = "rubric-v1" as const;

export const RubricKindEnum = z.enum(["technical", "numeric", "star"]);
export type RubricKind = z.infer<typeof RubricKindEnum>;

/** Who produced the rubric. `heuristic` = derived from answer text without an LLM. */
export const RubricProvenanceEnum = z.enum(["llm", "heuristic", "human", "source"]);
export type RubricProvenance = z.infer<typeof RubricProvenanceEnum>;

export const ReviewStatusEnum = z.enum(["pending", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;

export const RubricKeyPointSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  /** Weights across key_points sum to 1.0 (validators enforce ±0.01). */
  weight: z.number().min(0).max(1),
  must_have: z.boolean().default(false),
  /** Optional cue phrases for the deterministic fallback grader. */
  cues: z.array(z.string()).default([]),
});
export type RubricKeyPoint = z.infer<typeof RubricKeyPointSchema>;

export const NumericToleranceKindEnum = z.enum(["relative", "absolute"]);

export const RubricNumericCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Calculator id in packages/domain finance (e.g. `wacc`, `moic`). */
  calculator: z.string().nullable().optional(),
  inputs: z.record(z.string(), z.unknown()).nullable().optional(),
  expected: z.number(),
  tolerance: z.number().nonnegative().default(0.02),
  tolerance_kind: NumericToleranceKindEnum.default("relative"),
  /** `%`, `x`, `$`, `$mm`, `$bn`, `years` … used by number extraction. */
  unit: z.string().nullable().optional(),
});
export type RubricNumericCheck = z.infer<typeof RubricNumericCheckSchema>;

export const AnswerRubricSchema = z.object({
  version: z.literal(RUBRIC_VERSION).default(RUBRIC_VERSION),
  kind: RubricKindEnum.default("technical"),
  key_points: z.array(RubricKeyPointSchema).min(1).max(8),
  red_flags: z.array(z.string()).default([]),
  common_mistakes: z.array(z.string()).default([]),
  follow_ups: z.array(z.string()).default([]),
  numeric_checks: z.array(RubricNumericCheckSchema).default([]),
  provenance: RubricProvenanceEnum,
  review_status: ReviewStatusEnum.default("pending"),
  model: z.string().nullable().optional(),
  prompt_version: z.string().nullable().optional(),
  generated_at: z.string().nullable().optional(),
});
export type AnswerRubric = z.infer<typeof AnswerRubricSchema>;

/* ------------------------------------------------------------------ */
/* Grader v2 output                                                    */
/* ------------------------------------------------------------------ */

export const GRADER_VERSION = "grader-v2" as const;

export const RubricVerdictEnum = z.enum(["hit", "partial", "miss"]);
export type RubricVerdict = z.infer<typeof RubricVerdictEnum>;

export const RubricItemResultSchema = z.object({
  id: z.string(),
  text: z.string(),
  weight: z.number().min(0).max(1),
  must_have: z.boolean().default(false),
  verdict: RubricVerdictEnum,
  /** Verbatim quote from the candidate answer; code verifies it is a substring. */
  evidence: z.string().nullable().optional(),
});
export type RubricItemResult = z.infer<typeof RubricItemResultSchema>;

export const NumericCheckResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  expected: z.number(),
  found: z.number().nullable(),
  pass: z.boolean(),
  unit: z.string().nullable().optional(),
});
export type NumericCheckResult = z.infer<typeof NumericCheckResultSchema>;

export const DeliveryScoreSchema = z.object({
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  word_count: z.number().int().nonnegative().nullable().optional(),
  words_per_minute: z.number().nonnegative().nullable().optional(),
  filler_count: z.number().int().nonnegative().nullable().optional(),
  score: z.number().min(0).max(1).nullable().optional(),
  note: z.string().nullable().optional(),
});
export type DeliveryScore = z.infer<typeof DeliveryScoreSchema>;

/** Extra grade fields layered onto AttemptGradeResponse by grader v2. */
export const GradeDetailSchema = z.object({
  grader_version: z.string().default(GRADER_VERSION),
  correct: z.boolean().nullable().optional(),
  rubric_items: z.array(RubricItemResultSchema).default([]),
  red_flags_triggered: z.array(z.string()).default([]),
  numeric_checks: z.array(NumericCheckResultSchema).default([]),
  follow_up: z.string().nullable().optional(),
  delivery: DeliveryScoreSchema.nullable().optional(),
  /** True when the grade came from cache (same question, rubric, normalised answer). */
  cached: z.boolean().default(false),
});
export type GradeDetail = z.infer<typeof GradeDetailSchema>;

/* ------------------------------------------------------------------ */
/* Numeric drills                                                      */
/* ------------------------------------------------------------------ */

export const DrillInstanceSchema = z.object({
  /** `drill:<template_id>:<seed>` — stable, reproducible. */
  id: z.string(),
  template_id: z.string(),
  seed: z.string(),
  topic: z.string(),
  concept_id: z.string().nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  prompt: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  unit: z.string().nullable().optional(),
});
export type DrillInstance = z.infer<typeof DrillInstanceSchema>;

export const DrillSolutionSchema = z.object({
  answer: z.number(),
  unit: z.string().nullable().optional(),
  tolerance: z.number().nonnegative(),
  tolerance_kind: NumericToleranceKindEnum,
  explanation: z.string(),
});
export type DrillSolution = z.infer<typeof DrillSolutionSchema>;

/* ------------------------------------------------------------------ */
/* Activity (streak / XP / achievements) returned after graded actions */
/* ------------------------------------------------------------------ */

export const ActivityKindEnum = z.enum(["attempt", "drill", "mock_complete", "placement"]);
export type ActivityKind = z.infer<typeof ActivityKindEnum>;

export const StreakSummarySchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  freezes: z.number().int().nonnegative(),
  goal_met_today: z.boolean(),
  local_date: z.string(),
});
export type StreakSummary = z.infer<typeof StreakSummarySchema>;

export const AchievementEarnedSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
});
export type AchievementEarned = z.infer<typeof AchievementEarnedSchema>;

export const ActivityResultSchema = z.object({
  xp_awarded: z.number().int().nonnegative().default(0),
  xp_total: z.number().int().nonnegative().nullable().optional(),
  streak: StreakSummarySchema.nullable().optional(),
  daily_set: z
    .object({ completed: z.number().int().nonnegative(), goal: z.number().int().positive() })
    .nullable()
    .optional(),
  achievements_earned: z.array(AchievementEarnedSchema).default([]),
});
export type ActivityResult = z.infer<typeof ActivityResultSchema>;
