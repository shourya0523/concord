/**
 * Feature flags — defaults for local/dev; override via env or Edge Config later.
 */
import { z } from "zod";

export const FeatureFlagsSchema = z.object({
  /** Next.js product UI (Wave 2). */
  product_ui: z.boolean().default(false),
  /** Neon Auth end-user auth (Wave 2). Distinct from Glassdoor scrape login. */
  neon_auth: z.boolean().default(false),
  /** Hybrid search + pseudo-RAG (Wave 2). */
  hybrid_search: z.boolean().default(false),
  /** Gemini enrich jobs (Wave 1 answers stream). */
  gemini_enrich: z.boolean().default(true),
  /**
   * Prefer BFF scrape backend. Default false (ADR 0006): manual captcha /
   * Patchright session is the supported dataset-update path.
   */
  scrape_bff_default: z.boolean().default(false),
  /** Allow synthesised answers into published corpus after validation. */
  publish_synthesised_answers: z.boolean().default(false),
  /** Company prep rooms use Glassdoor topic heat. */
  firm_topic_heat: z.boolean().default(true),
  /**
   * Learning-loop flags (plan 2026-09-23-001). Each degrades gracefully:
   * grader v2 falls back to v1/deterministic, notifications no-op without
   * provider keys, leagues are opt-in per user.
   */
  /** Rubric judge + numeric checks + anti-gaming (Phase 3). */
  grader_v2: z.boolean().default(true),
  /** Daily set + Today home (Phase 4). */
  daily_set: z.boolean().default(true),
  /** Streaks, freezes, XP, readiness, achievements (Phase 5). */
  gamification: z.boolean().default(true),
  /** Email / web-push reminders (Phase 6). */
  notifications: z.boolean().default(true),
  /** Spoken answers + transcription (Phase 7). Needs mic + Gemini key. */
  voice_answers: z.boolean().default(false),
  /** Opt-in weekly XP leagues (Phase 7). */
  leagues: z.boolean().default(true),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

const ENV_FLAG_MAP: Record<keyof FeatureFlags, string> = {
  product_ui: "FLAG_PRODUCT_UI",
  neon_auth: "FLAG_NEON_AUTH",
  hybrid_search: "FLAG_HYBRID_SEARCH",
  gemini_enrich: "FLAG_GEMINI_ENRICH",
  scrape_bff_default: "FLAG_SCRAPE_BFF_DEFAULT",
  publish_synthesised_answers: "FLAG_PUBLISH_SYNTHESISED",
  firm_topic_heat: "FLAG_FIRM_TOPIC_HEAT",
  grader_v2: "FLAG_GRADER_V2",
  daily_set: "FLAG_DAILY_SET",
  gamification: "FLAG_GAMIFICATION",
  notifications: "FLAG_NOTIFICATIONS",
  voice_answers: "FLAG_VOICE_ANSWERS",
  leagues: "FLAG_LEAGUES",
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function loadFeatureFlags(
  source: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): FeatureFlags {
  const defaults = FeatureFlagsSchema.parse({});
  const fromEnv = Object.fromEntries(
    (Object.keys(ENV_FLAG_MAP) as (keyof FeatureFlags)[]).map((key) => [
      key,
      parseBool(source[ENV_FLAG_MAP[key]], defaults[key]),
    ]),
  ) as FeatureFlags;
  return FeatureFlagsSchema.parse(fromEnv);
}
