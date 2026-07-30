/**
 * Questions list/detail — prefer published.v_questions; else bank fallback.
 */
import { CanonicalQuestionSchema, type CanonicalQuestion } from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  getBankQuestion,
  listBankAsCanonical,
} from "@/lib/data/bank-fallback";
import type { QuestionDetailResponse, QuestionListResponse } from "@/lib/api/schemas";

type PublishedQuestionRow = {
  id: string;
  canonical_wording: string;
  question_type: string | null;
  topic: string | null;
  subtopic: string | null;
  domain: string | null;
  track: string | null;
  pe_strategy: string | null;
  pe_relevance: string | null;
  seniority: string | null;
  difficulty: string | null;
  provenance: string | null;
};

function rowToCanonical(row: PublishedQuestionRow): CanonicalQuestion {
  const candidate = {
    id: row.id,
    canonical_wording: row.canonical_wording,
    question_type: row.question_type ?? "technical",
    topic: row.topic,
    subtopic: row.subtopic,
    domain: row.domain ?? "other",
    pe_strategy: row.pe_strategy,
    pe_relevance: row.pe_relevance,
    seniority: row.seniority,
    difficulty: row.difficulty,
    review_state: "published",
    normalised_hash: null,
  };
  return CanonicalQuestionSchema.parse(candidate);
}

export async function listQuestions(options: {
  q?: string;
  track?: string;
  limit?: number;
  offset?: number;
}): Promise<QuestionListResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  if (!isDatabaseConfigured()) {
    const { items, total } = await listBankAsCanonical({
      q: options.q,
      track: options.track,
      limit,
      offset,
    });
    return { items, total, limit, offset, source: "bank_fallback" };
  }

  const sql = requireSql();
  const needle = options.q?.trim() || null;
  const track = options.track?.trim() || null;

  const rows = (await sql`
    SELECT
      id, canonical_wording, question_type, topic, subtopic, domain, track,
      pe_strategy, pe_relevance, seniority, difficulty, provenance
    FROM published.v_questions
    WHERE (${needle}::text IS NULL OR canonical_wording ILIKE '%' || ${needle} || '%')
      AND (${track}::text IS NULL OR track = ${track} OR domain = lower(${track}))
    ORDER BY updated_at DESC NULLS LAST, id
    LIMIT ${limit} OFFSET ${offset}
  `) as PublishedQuestionRow[];

  const countRows = (await sql`
    SELECT count(*)::int AS n
    FROM published.v_questions
    WHERE (${needle}::text IS NULL OR canonical_wording ILIKE '%' || ${needle} || '%')
      AND (${track}::text IS NULL OR track = ${track} OR domain = lower(${track}))
  `) as { n: number }[];

  const items = rows.map(rowToCanonical);
  const total = countRows[0]?.n ?? items.length;

  if (items.length === 0 && total === 0) {
    // Empty published corpus → soft-fallback to bank for local UX
    const fallback = await listBankAsCanonical({
      q: options.q,
      track: options.track,
      limit,
      offset,
    });
    if (fallback.total > 0) {
      return {
        items: fallback.items,
        total: fallback.total,
        limit,
        offset,
        source: "bank_fallback",
      };
    }
    return { items: [], total: 0, limit, offset, source: "empty" };
  }

  return { items, total, limit, offset, source: "published" };
}

export async function getQuestion(id: string): Promise<QuestionDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const hit = await getBankQuestion(id);
    if (!hit) return null;
    return {
      question: hit.question,
      bank_signals: [hit.bank],
      source: "bank_fallback",
    };
  }

  const sql = requireSql();
  const rows = (await sql`
    SELECT
      id, canonical_wording, question_type, topic, subtopic, domain, track,
      pe_strategy, pe_relevance, seniority, difficulty, provenance
    FROM published.v_questions
    WHERE id = ${id}
    LIMIT 1
  `) as PublishedQuestionRow[];

  if (rows[0]) {
    return {
      question: rowToCanonical(rows[0]),
      bank_signals: [],
      source: "published",
    };
  }

  const hit = await getBankQuestion(id);
  if (!hit) return null;
  return {
    question: hit.question,
    bank_signals: [hit.bank],
    source: "bank_fallback",
  };
}
