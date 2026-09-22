/**
 * Offline teaching fallback when DATABASE_URL is unset (or the published
 * corpus is empty): curated Q/A from packages/search/fixtures/teaching_seed.json.
 * Teaching truth (DESIGN.md §1) — these rows carry answers. Glassdoor bank rows
 * (bank-fallback.ts) stay firm signals only and never feed this module.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CanonicalQuestion, Domain } from "@ibpe/contracts";
import type { QuestionDetailResponse } from "@/lib/api/schemas";

type StudyBlock = NonNullable<QuestionDetailResponse["study"]>;

const SeedQuestionSchema = z.object({
  id: z.string().min(1),
  domain: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.string().optional(),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  // Optional richer layers — mapped through when a curated row carries them.
  interview_ready_explanation: z.string().optional(),
  step_by_step: z.array(z.string()).optional(),
  formulae: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  common_mistakes: z.array(z.string()).optional(),
  follow_ups: z.array(z.string()).optional(),
});
export type TeachingSeedQuestion = z.infer<typeof SeedQuestionSchema>;

const SeedFileSchema = z.object({
  fixture_id: z.string().optional(),
  fixture_origin: z.string().optional(),
  not_glassdoor: z.boolean().optional(),
  questions: z.array(z.unknown()).default([]),
});

export type TeachingSeed = {
  /** Human label for the provenance chip / sources list. */
  source_label: string;
  questions: TeachingSeedQuestion[];
};

const EMPTY_SEED: TeachingSeed = { source_label: "static_seed", questions: [] };

/** Validate a raw seed file. Refuses files flagged as Glassdoor-derived. */
export function parseTeachingSeed(raw: unknown): TeachingSeed {
  const parsed = SeedFileSchema.safeParse(raw);
  if (!parsed.success) return EMPTY_SEED;
  if (parsed.data.not_glassdoor === false) {
    console.warn("[teaching-seed] seed is flagged as Glassdoor-derived; ignoring");
    return EMPTY_SEED;
  }
  const questions = parsed.data.questions
    .map((q) => SeedQuestionSchema.safeParse(q))
    .filter((r) => r.success)
    .map((r) => r.data);
  const origin = parsed.data.fixture_origin ?? parsed.data.fixture_id;
  return {
    source_label: origin ? `Teaching seed · ${origin}` : "Teaching seed",
    questions,
  };
}

let cache: { file: string; mtimeMs: number; seed: TeachingSeed } | null = null;

function seedPath(): string {
  return (
    process.env.TEACHING_SEED_PATH?.trim() ||
    path.resolve(process.cwd(), "../../packages/search/fixtures/teaching_seed.json")
  );
}

export function loadTeachingSeed(): TeachingSeed {
  const file = seedPath();
  try {
    const st = statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === st.mtimeMs) {
      return cache.seed;
    }
    const seed = parseTeachingSeed(JSON.parse(readFileSync(file, "utf8")));
    cache = { file, mtimeMs: st.mtimeMs, seed };
    return seed;
  } catch (err) {
    console.warn("[teaching-seed] could not load seed", err);
    return EMPTY_SEED;
  }
}

function toDomain(value: string | undefined): Domain {
  switch (value?.toLowerCase()) {
    case "ib":
    case "pe":
    case "both":
      return value.toLowerCase() as Domain;
    default:
      return "other";
  }
}

export function seedRowToCanonical(row: TeachingSeedQuestion): CanonicalQuestion {
  return {
    id: row.id,
    canonical_wording: row.question,
    question_type: "technical",
    topic: row.topic ?? null,
    subtopic: null,
    domain: toDomain(row.domain),
    pe_strategy: null,
    pe_relevance: null,
    seniority: null,
    difficulty: row.difficulty ?? null,
    review_state: "static_seed",
    normalised_hash: null,
  };
}

/** Stable answer id for a seed row (seed rows have one answer each). */
export function seedAnswerId(row: TeachingSeedQuestion): string {
  return `${row.id}_answer`;
}

/**
 * Map a seed row to the legacy study block. Diagrams are resolved by the
 * caller (they need the diagram asset store). Only layers present in the
 * row are emitted — no synthetic walkthrough / mistakes.
 */
export function seedRowToStudy(
  row: TeachingSeedQuestion,
  sourceLabel: string,
): StudyBlock {
  const direct = row.answer.trim();
  const interviewReady = row.interview_ready_explanation?.trim() ?? "";
  const clean = (items: string[] | undefined) =>
    (items ?? []).map((item) => item.trim()).filter(Boolean);
  return {
    answer_id: seedAnswerId(row),
    direct_answer: direct,
    interview_ready_explanation:
      interviewReady && interviewReady !== direct ? interviewReady : null,
    step_by_step: clean(row.step_by_step),
    diagram_refs: [],
    diagram_asset: null,
    formulae: clean(row.formulae),
    assumptions: clean(row.assumptions),
    common_mistakes: clean(row.common_mistakes),
    follow_ups: clean(row.follow_ups),
    related_concepts: [],
    resources: [],
    sources: [{ label: sourceLabel, provenance: "static_seed" }],
    validation: {
      provenance_type: "static_seed",
      confidence: null,
      difficulty: row.difficulty ?? null,
    },
  };
}

export function filterSeedQuestions(
  seed: TeachingSeed,
  options: { q?: string; track?: string; topic?: string },
): TeachingSeedQuestion[] {
  const needle = options.q?.trim().toLowerCase();
  const track = options.track?.trim().toLowerCase();
  const topic = options.topic?.trim();
  return seed.questions.filter((row) => {
    if (topic && row.topic !== topic) return false;
    if (track) {
      const domain = toDomain(row.domain);
      if (domain !== track && domain !== "both") return false;
    }
    if (!needle) return true;
    return row.question.toLowerCase().includes(needle);
  });
}

export function getSeedQuestion(
  id: string,
): { row: TeachingSeedQuestion; source_label: string } | null {
  const seed = loadTeachingSeed();
  const row = seed.questions.find((q) => q.id === id);
  return row ? { row, source_label: seed.source_label } : null;
}
