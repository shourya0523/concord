/**
 * Load teaching corpus for search / packs.
 * Sources: static seed JSON, published exports JSONL — never Glassdoor as answers.
 */
import type { Provenance } from "@ibpe/contracts";
import { readFileSync } from "node:fs";
import { inferTopic } from "./topics.js";
import type { TeachingDocument } from "./types.js";

type SeedQuestion = {
  id: string;
  domain?: string;
  topic?: string;
  difficulty?: string;
  question: string;
  answer: string;
};

type ExportQuestion = {
  id: string;
  canonical_wording: string;
  topic?: string | null;
  domain?: string | null;
  difficulty?: string | null;
  review_state?: string;
};

type ExportAnswer = {
  id: string;
  canonical_question_id: string;
  concise_answer?: string;
  expanded_explanation?: string;
  provenance_type?: string;
};

function mapAnswerProvenance(raw: string | undefined, isSeed: boolean): Provenance {
  if (isSeed) return "static_seed";
  switch (raw) {
    case "source_provided":
    case "corpus_matched":
      return "github_source";
    case "synthesised_unvalidated":
    case "synthesised_validated":
      return "gemini_synthesised";
    case "needs_review":
    case "rejected":
      return "editorial";
    default:
      return "github_source";
  }
}

export function loadTeachingCorpusFromSeed(path: string): TeachingDocument[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    questions?: SeedQuestion[];
    fixture_origin?: string;
  };
  const questions = raw.questions ?? [];
  return questions.map((q) => ({
    id: q.id,
    title: q.question,
    body: q.answer,
    topic: q.topic ?? inferTopic(q.question),
    domain: q.domain ?? null,
    difficulty: q.difficulty ?? null,
    provenance: "static_seed" as const,
    concept_ids: q.topic ? [`concept_${q.topic}`] : [],
    firm_ids: [],
    source_label: raw.fixture_origin ?? "static_seed",
  }));
}

/**
 * Join exports/questions.jsonl + answers.jsonl into teaching docs.
 * Skips topic_signal / occurrence-only rows without answers.
 */
export function loadTeachingCorpusFromExports(
  questionsPath: string,
  answersPath: string,
): TeachingDocument[] {
  const questions = readJsonl<ExportQuestion>(questionsPath);
  const answers = readJsonl<ExportAnswer>(answersPath);
  const byQ = new Map(answers.map((a) => [a.canonical_question_id, a]));
  const out: TeachingDocument[] = [];
  for (const q of questions) {
    if (q.review_state === "topic_signal") continue;
    const ans = byQ.get(q.id);
    if (!ans) continue;
    const body =
      ans.concise_answer ||
      ans.expanded_explanation ||
      "";
    if (!body.trim()) continue;
    const provenance = q.id.startsWith("seed_")
      ? ("static_seed" as const)
      : mapAnswerProvenance(ans.provenance_type, false);
    const topic = q.topic ?? inferTopic(q.canonical_wording);
    out.push({
      id: q.id,
      title: q.canonical_wording,
      body,
      topic: topic === "untagged" ? null : topic,
      domain: q.domain ?? null,
      difficulty: q.difficulty ?? null,
      provenance,
      concept_ids: topic && topic !== "untagged" ? [`concept_${topic}`] : [],
      firm_ids: [],
      source_label: ans.provenance_type ?? "export",
    });
  }
  return out;
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(path, "utf8");
  const rows: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed) as T);
  }
  return rows;
}

/** Deduplicate by id — prefer github_source / static_seed over synthesised. */
export function mergeTeachingDocuments(
  ...groups: TeachingDocument[][]
): TeachingDocument[] {
  const rank: Record<Provenance, number> = {
    github_source: 4,
    static_seed: 3,
    editorial: 2,
    gemini_synthesised: 1,
    glassdoor_occurrence: 0,
  };
  const map = new Map<string, TeachingDocument>();
  for (const group of groups) {
    for (const doc of group) {
      if (doc.provenance === "glassdoor_occurrence") continue; // never teaching
      const prev = map.get(doc.id);
      if (!prev || rank[doc.provenance] >= rank[prev.provenance]) {
        map.set(doc.id, doc);
      }
    }
  }
  return [...map.values()];
}
