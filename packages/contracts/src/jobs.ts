/**
 * Job events, API errors, audit events.
 */
import { z } from "zod";
import { ApiErrorCodeEnum, JobStateEnum, ScrapeBackendEnum } from "./enums.js";
import { CompletedJobSchema } from "./bank.js";

export const JobEventSchema = z.object({
  id: z.string(),
  job_name: z.string(),
  idempotency_key: z.string(),
  event_type: z.enum([
    "queued",
    "started",
    "progress",
    "checkpoint",
    "completed",
    "failed",
    "dead_letter",
    "skipped",
    "cancelled",
  ]),
  state: JobStateEnum.optional(),
  ts: z.string(),
  message: z.string().optional(),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  backend: ScrapeBackendEnum.or(z.string()).optional(),
  error_classification: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type JobEvent = z.infer<typeof JobEventSchema>;

/** API error envelope for Next.js route handlers / BFF product APIs. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeEnum,
    message: z.string(),
    details: z.unknown().optional(),
    request_id: z.string().optional(),
    retryable: z.boolean().default(false),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  actor_id: z.string().nullable().optional(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().nullable().optional(),
  ts: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Scrape-job completion event that can sync into bank completed_jobs[].
 */
export const ScrapeCompletedJobEventSchema = z.object({
  type: z.literal("scrape.completed_job"),
  job: CompletedJobSchema,
  event: JobEventSchema.optional(),
});
export type ScrapeCompletedJobEvent = z.infer<typeof ScrapeCompletedJobEventSchema>;
