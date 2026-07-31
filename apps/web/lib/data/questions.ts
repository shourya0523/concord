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
import {
  diagramsForConcepts,
  resourcesForConcepts,
} from "@/lib/data/learning";

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

type PublishedAnswerRow = {
  id: string;
  concise_answer: string;
  expanded_explanation: string;
  assumptions_json: unknown;
  calculation_json: unknown;
  common_mistakes_json: unknown;
  follow_ups_json: unknown;
  provenance_type: string;
  confidence: number | null;
  difficulty: string | null;
  references_json: unknown;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .filter(Boolean);
}

function emptyStudy(): NonNullable<QuestionDetailResponse["study"]> {
  return {
    answer_id: null,
    direct_answer: null,
    interview_ready_explanation: null,
    step_by_step: [],
    diagram_refs: [],
    formulae: [],
    assumptions: [],
    common_mistakes: [],
    follow_ups: [],
    related_concepts: [],
    resources: [],
    sources: [],
    validation: null,
  };
}

async function getPublishedStudyPayload(options: {
  questionId: string;
  conceptIds: string[];
}): Promise<NonNullable<QuestionDetailResponse["study"]>> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT
      id,
      concise_answer,
      expanded_explanation,
      assumptions_json,
      calculation_json,
      common_mistakes_json,
      follow_ups_json,
      provenance_type,
      confidence,
      difficulty,
      references_json
    FROM published.v_answers
    WHERE canonical_question_id = ${options.questionId}
    ORDER BY confidence DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1
  `) as PublishedAnswerRow[];
  const row = rows[0];
  if (!row) return emptyStudy();

  const formulae = Array.isArray(row.calculation_json)
    ? asStringArray(row.calculation_json)
    : row.calculation_json
      ? [JSON.stringify(row.calculation_json)]
      : [];
  const references = Array.isArray(row.references_json)
    ? row.references_json
    : [];
  const sources: Array<{ label?: string; provenance: string; url?: string }> = [];
  for (const item of references) {
    if (typeof item === "string") {
      sources.push({ label: item, provenance: row.provenance_type });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    sources.push({
      label:
        typeof record.label === "string"
          ? record.label
          : typeof record.title === "string"
            ? record.title
            : undefined,
      provenance:
        typeof record.provenance === "string"
          ? record.provenance
          : row.provenance_type,
      url: typeof record.url === "string" ? record.url : undefined,
    });
  }

  return {
    answer_id: row.id,
    direct_answer: row.concise_answer,
    interview_ready_explanation: row.expanded_explanation,
    step_by_step: row.expanded_explanation
      .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 8),
    diagram_refs: diagramsForConcepts(options.conceptIds),
    formulae,
    assumptions: asStringArray(row.assumptions_json),
    common_mistakes: asStringArray(row.common_mistakes_json),
    follow_ups: asStringArray(row.follow_ups_json),
    related_concepts: [],
    resources: resourcesForConcepts(options.conceptIds),
    sources,
    validation: {
      provenance_type: row.provenance_type,
      confidence: row.confidence == null ? null : Number(row.confidence),
      difficulty: row.difficulty,
    },
  };
}

export async function getQuestion(
  id: string,
  options?: { includeStudy?: boolean },
): Promise<QuestionDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const hit = await getBankQuestion(id);
    if (!hit) return null;
    return {
      question: hit.question,
      bank_signals: [hit.bank],
      ...(options?.includeStudy ? { study: emptyStudy() } : {}),
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
    const question = rowToCanonical(rows[0]);
    const conceptIds = question.topic ? [question.topic] : [];
    return {
      question,
      bank_signals: [],
      ...(options?.includeStudy
        ? {
            study: await getPublishedStudyPayload({
              questionId: id,
              conceptIds,
            }),
          }
        : {}),
      source: "published",
    };
  }

  const hit = await getBankQuestion(id);
  if (!hit) return null;
  return {
    question: hit.question,
    bank_signals: [hit.bank],
    ...(options?.includeStudy ? { study: emptyStudy() } : {}),
    source: "bank_fallback",
  };
}
