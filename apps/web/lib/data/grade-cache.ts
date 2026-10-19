/**
 * Grade cache + per-user LLM rate limit (plan P3.5).
 *
 * Key = sha256(question_id, rubric fingerprint, grader version, model,
 * normalised answer). In-process LRU always; Upstash Redis REST when
 * UPSTASH_REDIS_REST_URL / _TOKEN are set (shared across serverless
 * instances). Failures never block grading — they just miss the cache.
 */
import { createHash } from "node:crypto";
import type { PracticeGradeResult } from "@/lib/practice-grade-core";
import { incrementWindow, TtlLru, type LruEntry } from "@/lib/grading/lru";
import { normaliseForMatch } from "@/lib/grading/text";
import { memoryStore } from "./memory-store";

export const GRADE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GRADE_CACHE_MAX_ENTRIES = 500;
/**
 * Per-user hourly model budget, in units: a small-model chat grade costs
 * CHAT_GRADE_UNITS, a Jev decision JEV_GRADE_UNITS (1/10 — Jev is billed on
 * input tokens only at $0.042/M). 600 units = 60 chat grades (the previous
 * limit) or 600 Jev grades an hour.
 */
export const CHAT_GRADE_UNITS = 10;
export const JEV_GRADE_UNITS = 1;
export const LLM_GRADE_UNITS_PER_HOUR = 600;
/** Chat-grade equivalent of the hourly budget (kept for callers / docs). */
export const LLM_GRADES_PER_HOUR = LLM_GRADE_UNITS_PER_HOUR / CHAT_GRADE_UNITS;
const HOUR_MS = 60 * 60 * 1000;
const UPSTASH_TIMEOUT_MS = 800;

const memoryCache = new TtlLru<PracticeGradeResult>(
  memoryStore<string, LruEntry<PracticeGradeResult>>("grade_cache"),
  GRADE_CACHE_MAX_ENTRIES,
  GRADE_CACHE_TTL_MS,
);
const memoryRate = memoryStore<string, LruEntry<number>>("grade_rate_limit");

export function gradeCacheKey(options: {
  questionId: string;
  rubricFingerprint: string;
  graderVersion: string;
  model: string | null;
  responseText: string;
}): string {
  const material = [
    options.questionId,
    options.rubricFingerprint,
    options.graderVersion,
    options.model ?? "none",
    normaliseForMatch(options.responseText),
  ].join("␟");
  return `grade:${createHash("sha256").update(material).digest("hex")}`;
}

type UpstashConfig = { url: string; token: string };

function upstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function upstashPipeline(
  config: UpstashConfig,
  commands: Array<Array<string | number>>,
): Promise<Array<{ result?: unknown; error?: string }> | null> {
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as Array<{ result?: unknown; error?: string }>;
  } catch (err) {
    console.warn("[grade-cache] Upstash request failed", err);
    return null;
  }
}

export async function getCachedGrade(key: string): Promise<PracticeGradeResult | null> {
  const local = memoryCache.get(key);
  if (local) return local;
  const config = upstashConfig();
  if (!config) return null;
  const result = await upstashPipeline(config, [["GET", key]]);
  const raw = result?.[0]?.result;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as PracticeGradeResult;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedGrade(key: string, grade: PracticeGradeResult): Promise<void> {
  const value: PracticeGradeResult = { ...grade, cached: false, latency_ms: undefined };
  memoryCache.set(key, value);
  const config = upstashConfig();
  if (!config) return;
  await upstashPipeline(config, [
    ["SET", key, JSON.stringify(value), "PX", GRADE_CACHE_TTL_MS],
  ]);
}

/**
 * Reserve model budget for this user in the current hour: `kind` "decision"
 * (Jev) costs JEV_GRADE_UNITS, "chat" CHAT_GRADE_UNITS. Returns false when the
 * user would exceed LLM_GRADE_UNITS_PER_HOUR (caller skips that call).
 */
export async function reserveLlmGrade(
  userId: string,
  kind: "decision" | "chat" = "chat",
  now = Date.now(),
): Promise<boolean> {
  const units = kind === "decision" ? JEV_GRADE_UNITS : CHAT_GRADE_UNITS;
  const bucket = Math.floor(now / HOUR_MS);
  const key = `grade_rl:${createHash("sha256").update(userId).digest("hex").slice(0, 24)}:${bucket}`;
  const config = upstashConfig();
  if (config) {
    const result = await upstashPipeline(config, [
      ["INCRBY", key, units],
      ["PEXPIRE", key, HOUR_MS + 60_000],
    ]);
    const count = Number(result?.[0]?.result);
    if (Number.isFinite(count)) return count <= LLM_GRADE_UNITS_PER_HOUR;
  }
  return incrementWindow(memoryRate, key, HOUR_MS, now, units) <= LLM_GRADE_UNITS_PER_HOUR;
}

export function logGradeEvent(event: {
  question_id: string;
  score_source: string;
  grader_version: string;
  cached: boolean;
  latency_ms: number;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  rate_limited?: boolean;
  llm_error?: string | null;
  /** Grade router reason (lib/grading/router.ts). */
  router?: string | null;
  /** USD from OpenRouter usage accounting (Jev + chat). */
  cost?: number | null;
  /** GradeRoute path: skip | jev | jev+small | small | deterministic. */
  path?: string | null;
  escalation?: string | null;
  decision_model?: string | null;
  chat_model?: string | null;
}): void {
  console.info(`[grade] ${JSON.stringify(event)}`);
}
