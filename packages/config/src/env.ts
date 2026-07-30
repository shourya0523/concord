/**
 * Environment validation for product + scrape surfaces.
 * Never put Glassdoor secrets in NEXT_PUBLIC_* vars.
 */
import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** Scrape / worker secrets (Python CLI + apps/worker). */
export const ScrapeEnvSchema = z.object({
  GLASSDOOR_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  GLASSDOOR_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GLASSDOOR_LOGIN_METHOD: z
    .enum(["auto", "google", "indeed"])
    .default("auto")
    .optional(),
  GLASSDOOR_STATE_PATH: z.string().optional(),
  GLASSDOOR_TOTP_SECRET: z.string().optional(),
  HTTPS_PROXY: z.string().optional(),
  CAPSOLVER_API_KEY: z.string().optional(),
  CURL_CFFI_IMPERSONATE: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});
export type ScrapeEnv = z.infer<typeof ScrapeEnvSchema>;

/** Product app (apps/web) — Neon Postgres + Neon Auth + Blob + Redis. */
export const ProductEnvSchema = z.object({
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  // Neon Auth (Managed Better Auth) — Wave 2; see ADR 0006
  NEON_AUTH_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NEON_AUTH_COOKIE_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(32).optional(),
  ),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  // Vercel Blob for raw artefacts / exports
  BLOB_READ_WRITE_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  // Upstash Redis (sessions, rate limits, job coordination)
  UPSTASH_REDIS_REST_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  // Edge Config feature flags (optional)
  EDGE_CONFIG: z.preprocess(emptyToUndefined, z.string().optional()),
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  // Prefer AI Gateway on Vercel; GEMINI_API_KEY remains for local enrich jobs
  AI_GATEWAY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
});
export type ProductEnv = z.infer<typeof ProductEnvSchema>;

export const AppEnvSchema = ScrapeEnvSchema.merge(ProductEnvSchema);
export type AppEnv = z.infer<typeof AppEnvSchema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): AppEnv {
  return AppEnvSchema.parse(source);
}

export function safeParseEnv(
  source: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
) {
  return AppEnvSchema.safeParse(source);
}

/** Keys that must never be prefixed NEXT_PUBLIC_. */
export const SERVER_ONLY_ENV_KEYS = [
  "GLASSDOOR_EMAIL",
  "GLASSDOOR_PASSWORD",
  "GLASSDOOR_TOTP_SECRET",
  "HTTPS_PROXY",
  "CAPSOLVER_API_KEY",
  "GEMINI_API_KEY",
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
  "CRON_SECRET",
  "AI_GATEWAY_API_KEY",
] as const;
