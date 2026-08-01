/**
 * Questions list/detail — prefer published.v_questions; else bank fallback.
 */
import {
  CanonicalQuestionSchema,
  QuestionStudyPayloadSchema,
  type CanonicalQuestion,
  type QuestionStudyPayload,
} from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  getBankQuestion,
  listBankAsCanonical,
} from "@/lib/data/bank-fallback";
import type { QuestionDetailResponse, QuestionListResponse } from "@/lib/api/schemas";
import {
  diagramsForConcepts,
  getDiagramAssetForConcept,
} from "@/lib/data/learning";
import { conceptIdForTopic } from "@/lib/topics";

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
  topic?: string;
  limit?: number;
  offset?: number;
}): Promise<QuestionListResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  if (!isDatabaseConfigured()) {
    const { items, total } = await listBankAsCanonical({
      q: options.q,
      track: options.track,
      topic: options.topic,
      limit,
      offset,
    });
    return { items, total, limit, offset, source: "bank_fallback" };
  }

  const sql = requireSql();
  const needle = options.q?.trim() || null;
  const track = options.track?.trim() || null;
  const topic = options.topic?.trim() || null;

  const rows = (await sql`
    SELECT
      id, canonical_wording, question_type, topic, subtopic, domain, track,
      pe_strategy, pe_relevance, seniority, difficulty, provenance
    FROM published.v_questions
    WHERE (${needle}::text IS NULL OR canonical_wording ILIKE '%' || ${needle} || '%')
      AND (${track}::text IS NULL OR track = ${track} OR domain = lower(${track}))
      AND (${topic}::text IS NULL OR topic = ${topic})
    ORDER BY updated_at DESC NULLS LAST, id
    LIMIT ${limit} OFFSET ${offset}
  `) as PublishedQuestionRow[];

  const countRows = (await sql`
    SELECT count(*)::int AS n
    FROM published.v_questions
    WHERE (${needle}::text IS NULL OR canonical_wording ILIKE '%' || ${needle} || '%')
      AND (${track}::text IS NULL OR track = ${track} OR domain = lower(${track}))
      AND (${topic}::text IS NULL OR topic = ${topic})
  `) as { n: number }[];

  const items = rows.map(rowToCanonical);
  const total = countRows[0]?.n ?? items.length;

  if (items.length === 0 && total === 0) {
    // Empty published corpus → soft-fallback to bank for local UX
    const fallback = await listBankAsCanonical({
      q: options.q,
      track: options.track,
      topic: options.topic,
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
    diagram_asset: null,
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

function mapAnswerProvenance(
  value: string | null | undefined,
): QuestionStudyPayload["layers"]["provenance"]["answer_provenance"] {
  switch (value) {
    case "source_provided":
    case "corpus_matched":
    case "synthesised_unvalidated":
    case "synthesised_validated":
    case "needs_review":
    case "rejected":
      return value;
    case "github_source":
    case "static_seed":
    case "editorial":
      return "corpus_matched";
    case "gemini_synthesised":
      return "synthesised_unvalidated";
    default:
      return "needs_review";
  }
}

function toStudyPayload(options: {
  question: CanonicalQuestion;
  study: NonNullable<QuestionDetailResponse["study"]>;
}): QuestionStudyPayload {
  const diagram = options.study.diagram_refs[0] ?? null;
  return QuestionStudyPayloadSchema.parse({
    question_id: options.question.id,
    answer_id: options.study.answer_id,
    canonical_question_id: options.question.id,
    question_text: options.question.canonical_wording,
    topic: options.question.topic,
    difficulty: options.question.difficulty,
    firm_context: null,
    layers: {
      direct_answer: options.study.direct_answer ?? "",
      interview_ready: options.study.interview_ready_explanation ?? "",
      walkthrough: options.study.step_by_step.join("\n\n"),
      diagram_ref: diagram,
      formulae: options.study.formulae.map((expression, index) => ({
        label: `Formula ${index + 1}`,
        expression,
      })),
      assumptions: options.study.assumptions,
      common_mistakes: options.study.common_mistakes,
      follow_ups: options.study.follow_ups.map((question) => ({
        question,
        source_ids: [],
        concept_ids: [],
      })),
      related_concept_ids: options.study.related_concepts.map((c) => c.id),
      resources: options.study.resources,
      provenance: {
        answer_provenance: mapAnswerProvenance(
          options.study.validation?.provenance_type,
        ),
        source_ids: options.study.answer_id ? [options.study.answer_id] : [],
        citations: options.study.sources
          .filter((source) => source.provenance !== "glassdoor_occurrence")
          .map((source, index) => ({
            source_id: `src_${index}`,
            label: source.label,
            provenance:
              source.provenance === "github_source" ||
              source.provenance === "static_seed" ||
              source.provenance === "gemini_synthesised" ||
              source.provenance === "editorial"
                ? source.provenance
                : undefined,
          })),
      },
      validation: {
        status: options.study.answer_id ? "pass_with_assumptions" : "not_run",
        confidence: options.study.validation?.confidence ?? null,
        issues: [],
      },
    },
    mastery: null,
    weak_topic_ids: [],
  });
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

  const diagramAsset = options.conceptIds[0]
    ? await getDiagramAssetForConcept(options.conceptIds[0])
    : null;

  // Layers must not repeat: the direct answer often prefixes the expanded
  // explanation — strip it so the interview-ready layer adds new info.
  // Corpus concise answers are sometimes truncated with an ellipsis, so
  // compare on the stem (ellipsis removed), not the literal string.
  const concise = row.concise_answer.trim();
  const expanded = row.expanded_explanation.trim();
  const conciseStem = concise.replace(/(?:\.\.\.|…)+[\s…]*$/u, "").trimEnd();
  const expandedBeyondDirect =
    conciseStem.length > 0 && expanded.startsWith(conciseStem)
      ? expanded.slice(conciseStem.length).trim()
      : expanded;
  // No synthetic walkthrough: sentence-splitting the explanation duplicates
  // earlier layers. Real structured layers come from the json fields below
  // (formulae / assumptions / mistakes / follow-ups). step_by_step stays
  // empty until the corpus carries an explicit walkthrough field.
  const stepByStep: string[] = [];

  return {
    answer_id: row.id,
    direct_answer: row.concise_answer,
    interview_ready_explanation: expandedBeyondDirect || expanded,
    step_by_step: stepByStep,
    diagram_refs: diagramsForConcepts(options.conceptIds),
    diagram_asset: diagramAsset
      ? {
          id: diagramAsset.ref.id,
          title: diagramAsset.title,
          body: diagramAsset.body,
          a11y_fallback: diagramAsset.ref.a11y_fallback ?? null,
        }
      : null,
    formulae,
    assumptions: asStringArray(row.assumptions_json),
    common_mistakes: asStringArray(row.common_mistakes_json),
    follow_ups: asStringArray(row.follow_ups_json),
    related_concepts: [],
    resources: [],
    sources,
    validation: {
      provenance_type: row.provenance_type,
      confidence: row.confidence == null ? null : Number(row.confidence),
      difficulty: row.difficulty,
    },
  };
}

async function loadBankSignalsForQuestion(
  questionId: string,
): Promise<QuestionDetailResponse["bank_signals"]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT
        coalesce(o.legacy_bank_id, o.id) AS id,
        coalesce(o.employer_raw, f.name, 'Unknown') AS company,
        coalesce(o.track, 'IB') AS track,
        coalesce(nullif(o.role_raw, ''), 'Unknown') AS position,
        o.interview_date AS date_posted,
        NULL::text AS "user",
        NULL::text AS experience,
        coalesce(v.cleaned_wording, v.source_wording, '') AS question,
        o.process_text AS process,
        coalesce(o.scraped_at, o.created_at, now())::text AS scraped_at
      FROM canonical.question_occurrences o
      LEFT JOIN canonical.firms f ON f.id = o.firm_id
      LEFT JOIN canonical.question_variants v ON v.id = o.question_variant_id
      WHERE o.canonical_question_id = ${questionId}
      ORDER BY o.scraped_at DESC NULLS LAST, o.id
      LIMIT 12
    `) as Array<{
      id: string;
      company: string;
      track: string;
      position: string;
      date_posted: string | null;
      user: string | null;
      experience: string | null;
      question: string;
      process: string | null;
      scraped_at: string;
    }>;

    return rows
      .filter((row) => row.question.trim().length > 0)
      .map((row) => ({
        id: row.id,
        company: row.company,
        track: row.track,
        position: row.position,
        date_posted: row.date_posted,
        user: row.user,
        experience: row.experience,
        question: row.question,
        process: row.process,
        scraped_at: row.scraped_at,
      }));
  } catch (err) {
    console.warn("[questions] bank_signals load failed", err);
    return [];
  }
}

export async function getQuestion(
  id: string,
  options?: { includeStudy?: boolean },
): Promise<QuestionDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const hit = await getBankQuestion(id);
    if (!hit) return null;
    const study = options?.includeStudy ? emptyStudy() : undefined;
    return {
      question: hit.question,
      bank_signals: [hit.bank],
      ...(study
        ? {
            study,
            study_payload: toStudyPayload({
              question: hit.question,
              study,
            }),
          }
        : {}),
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
    const conceptId = question.topic ? conceptIdForTopic(question.topic) : null;
    const conceptIds = conceptId ? [conceptId] : [];
    const bank_signals = await loadBankSignalsForQuestion(id);
    if (!options?.includeStudy) {
      return { question, bank_signals, source: "published" };
    }
    const study = await getPublishedStudyPayload({
      questionId: id,
      conceptIds,
    });
    return {
      question,
      bank_signals,
      study,
      study_payload: toStudyPayload({ question, study }),
      source: "published",
    };
  }

  const hit = await getBankQuestion(id);
  if (!hit) return null;
  const study = options?.includeStudy ? emptyStudy() : undefined;
  return {
    question: hit.question,
    bank_signals: [hit.bank],
    ...(study
      ? {
          study,
          study_payload: toStudyPayload({
            question: hit.question,
            study,
          }),
        }
      : {}),
    source: "bank_fallback",
  };
}
