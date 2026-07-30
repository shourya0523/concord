/**
 * Glassdoor question-bank file shapes — absorb data/question_bank.json.
 */
import { z } from "zod";
import { BankTrackEnum, ScrapeBackendEnum } from "./enums.js";

/** Glassdoor signal row — matches data/question_bank.json questions[] */
export const BankQuestionSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  track: BankTrackEnum.or(z.string().min(1)),
  position: z.string().min(1),
  date_posted: z.string().nullable().optional(),
  user: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  question: z.string().min(1),
  process: z.string().nullable().optional(),
  scraped_at: z.string().min(1),
});
export type BankQuestion = z.infer<typeof BankQuestionSchema>;

/**
 * completed_jobs[] entry from the bank.
 * Observed fields: company, position, track, completed_at.
 * backend is optional for future BFF/parallel runners.
 */
export const CompletedJobSchema = z
  .object({
    company: z.string().min(1),
    position: z.string().min(1),
    track: BankTrackEnum.or(z.string()).optional(),
    completed_at: z.string().optional(),
    backend: ScrapeBackendEnum.or(z.string()).optional(),
    pages_scraped: z.number().int().nonnegative().optional(),
    questions_added: z.number().int().nonnegative().optional(),
    worker_id: z.string().optional(),
  })
  .passthrough();
export type CompletedJob = z.infer<typeof CompletedJobSchema>;

export const QuestionBankFileSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  updated_at: z.string().optional(),
  questions: z.array(BankQuestionSchema),
  completed_jobs: z.array(CompletedJobSchema).optional().default([]),
});
export type QuestionBankFile = z.infer<typeof QuestionBankFileSchema>;
