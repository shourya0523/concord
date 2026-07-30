/**
 * Glassdoor bank field → pipeline layer mapping (prompt §16–17).
 * Keep aligned with packages/contracts BankQuestionSchema.
 */

export const BANK_SOURCE_ID = "src_glassdoor_bank" as const;

/** Matches scrapers/bank.py make_question_id */
export function bankIdParts(company: string, position: string, question: string): string {
  return `${company}|${position}|${question.trim().toLowerCase()}`;
}

export type BankLayerTarget =
  | "raw.source_artifacts"
  | "staging.staging_records"
  | "canonical.firms"
  | "canonical.roles"
  | "canonical.question_variants"
  | "canonical.question_occurrences";

export const BANK_FIELD_MAP: Record<
  string,
  { layers: BankLayerTarget[]; column: string; notes: string }
> = {
  id: {
    layers: [
      "staging.staging_records",
      "canonical.question_variants",
      "canonical.question_occurrences",
    ],
    column: "legacy_bank_id",
    notes: "SHA1 idempotency key; also used as occurrence PK",
  },
  company: {
    layers: ["staging.staging_records", "canonical.firms", "canonical.question_occurrences"],
    column: "firm_raw / firms.name",
    notes: "Normalise via firm_aliases; never treat as answer provenance",
  },
  track: {
    layers: ["staging.staging_records", "canonical.question_occurrences"],
    column: "track_raw / track",
    notes: "IB | PE | Banking | …",
  },
  position: {
    layers: ["staging.staging_records", "canonical.roles", "canonical.question_occurrences"],
    column: "role_raw / roles.name",
    notes: "Slugify into roles",
  },
  date_posted: {
    layers: ["staging.staging_records", "canonical.question_occurrences"],
    column: "reported_date_raw / interview_date",
    notes: "Often empty in bank; nullable",
  },
  user: {
    layers: ["staging.staging_records"],
    column: "bank_payload_json.user",
    notes: "Keep in staging only",
  },
  experience: {
    layers: ["staging.staging_records"],
    column: "bank_payload_json.experience",
    notes: "Keep in staging only",
  },
  question: {
    layers: ["staging.staging_records", "canonical.question_variants"],
    column: "extracted_question / source_wording",
    notes: "Variant wording; join to teaching canonical later by data-quality",
  },
  process: {
    layers: ["staging.staging_records", "canonical.question_occurrences"],
    column: "process_text",
    notes: "Firm interview-process signal — NOT teaching answer text",
  },
  scraped_at: {
    layers: ["raw.source_artifacts", "staging.staging_records", "canonical.question_occurrences"],
    column: "retrieved_at / scraped_at",
    notes: "ISO timestamptz",
  },
};

export type BankQuestionRow = {
  id: string;
  company: string;
  track: string;
  position: string;
  date_posted?: string | null;
  user?: string | null;
  experience?: string | null;
  question: string;
  process?: string | null;
  scraped_at: string;
};
