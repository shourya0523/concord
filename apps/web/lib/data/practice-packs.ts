/**
 * Mode-specific practice pack builders.
 * Named modes never fall through to bare listQuestions unless explicitly unscoped.
 */
import type { PracticeSessionMode, TopicHeat } from "@ibpe/contracts";
import { normalizePracticeMode } from "@ibpe/contracts";
import type { CreatePracticeSessionRequest } from "@/lib/api/schemas";
import { getFirmTopicHeat } from "@/lib/data/firms";
import { listLearningModules } from "@/lib/data/learning";
import { listMastery } from "@/lib/data/mastery";
import { listQuestions } from "@/lib/data/questions";
import { buildRealPrepRagPack } from "@/lib/data/rag";
import { weakTopicsFromMastery } from "@/lib/weak-topics";
import { topicForConceptId } from "@/lib/topics";

export type FirmContextSnapshot = {
  firm_ids: string[];
  heat_topics: Array<{
    firm_id: string;
    topic_id: string;
    intensity: number;
    sample_size: number;
  }>;
  pack_backend?: "real_rag_embeddings" | "in_memory_hybrid" | "topic_list" | "checkpoint" | "mastery" | "fallback";
  notes: string[];
};

export type PracticePackResult = {
  mode: PracticeSessionMode;
  question_ids: string[];
  firm_context_snapshot: FirmContextSnapshot;
  stage_topic_map?: Record<string, string[]>;
};

const STAGE_TOPICS: Record<string, string[]> = {
  ib_fit: ["behavioural", "fit"],
  ib_accounting: ["accounting", "three_statements"],
  ib_valuation: ["valuation", "dcf", "wacc"],
  ib_deal_judgement: ["ma", "markets", "deal"],
  pe_fit: ["behavioural", "fit"],
  pe_lbo: ["lbo", "returns", "paper_lbo"],
  pe_ic: ["investment_committee", "deal", "judgement"],
  pe_portfolio: ["portfolio_operations", "value_creation"],
};

function uniqueIds(ids: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

async function heatForFirms(firmIds: string[]): Promise<TopicHeat[]> {
  const heat: TopicHeat[] = [];
  for (const firmId of firmIds.slice(0, 3)) {
    const res = await getFirmTopicHeat(firmId);
    heat.push(...res.topics);
  }
  return heat;
}

function snapshotFromHeat(
  firmIds: string[],
  heat: TopicHeat[],
  backend: FirmContextSnapshot["pack_backend"],
  notes: string[],
): FirmContextSnapshot {
  return {
    firm_ids: firmIds,
    heat_topics: heat.slice(0, 12).map((h) => ({
      firm_id: h.firm_id,
      topic_id: h.topic_id,
      intensity: h.intensity,
      sample_size: h.sample_size,
    })),
    pack_backend: backend,
    notes,
  };
}

async function packCompany(
  input: CreatePracticeSessionRequest,
): Promise<PracticePackResult> {
  const firmIds = input.firm_ids;
  const heat = await heatForFirms(firmIds);
  const topTopics = heat
    .slice()
    .sort((a, b) => b.intensity - a.intensity)
    .map((h) => h.topic_id)
    .filter((t) => t && t !== "untagged")
    .slice(0, 5);

  const notes: string[] = [];
  const ids: string[] = [];

  if (firmIds.length > 0) {
    const query =
      topTopics.length > 0
        ? `${topTopics.slice(0, 3).join(" ")} interview technicals`
        : "investment banking private equity interview technicals";
    try {
      const rag = await buildRealPrepRagPack({
        query,
        firm_ids: firmIds,
        weak_topics: topTopics,
        limit: input.limit,
        heat,
      });
      ids.push(...rag.pack.item_ids);
      notes.push(...rag.notes);
      if (rag.backend === "in_memory_hybrid") {
        notes.push("Company pack used lexical RAG fallback (dense embeddings unavailable).");
      }
      return {
        mode: "company",
        question_ids: uniqueIds(ids, input.limit),
        firm_context_snapshot: snapshotFromHeat(
          firmIds,
          heat,
          rag.backend,
          notes,
        ),
      };
    } catch (err) {
      console.warn("[practice-packs] company RAG pack failed", err);
      notes.push("Company RAG pack failed; falling back to topic-filtered teaching list.");
    }
  }

  for (const topic of topTopics) {
    if (ids.length >= input.limit) break;
    const listed = await listQuestions({
      topic,
      limit: Math.max(4, input.limit - ids.length),
      offset: 0,
    });
    ids.push(...listed.items.map((q) => q.id));
  }

  if (ids.length === 0) {
    const listed = await listQuestions({ limit: input.limit, offset: 0 });
    ids.push(...listed.items.map((q) => q.id));
    notes.push("No firm heat topics matched teaching rows; used general teaching bank.");
  }

  return {
    mode: "company",
    question_ids: uniqueIds(ids, input.limit),
    firm_context_snapshot: snapshotFromHeat(firmIds, heat, "topic_list", notes),
  };
}

async function packConcept(
  input: CreatePracticeSessionRequest,
): Promise<PracticePackResult> {
  const notes: string[] = [];
  const modules = await listLearningModules();
  const conceptFilter = new Set(input.concept_ids);
  const ids: string[] = [];

  for (const mod of modules.items) {
    for (const checkpoint of mod.checkpoints ?? []) {
      if (
        conceptFilter.size > 0 &&
        checkpoint.concept_id &&
        !conceptFilter.has(checkpoint.concept_id)
      ) {
        continue;
      }
      ids.push(...checkpoint.question_ids);
    }
  }

  if (ids.length === 0 && input.concept_ids.length > 0) {
    for (const conceptId of input.concept_ids) {
      const topic = topicForConceptId(conceptId);
      if (!topic) continue;
      const listed = await listQuestions({
        topic,
        limit: input.limit,
        offset: 0,
      });
      ids.push(...listed.items.map((q) => q.id));
    }
    notes.push("Checkpoint question_ids empty; used concept→topic teaching filter.");
  }

  if (ids.length === 0) {
    notes.push("No concept checkpoint questions available.");
  }

  return {
    mode: "concept",
    question_ids: uniqueIds(ids, input.limit),
    firm_context_snapshot: {
      firm_ids: input.firm_ids,
      heat_topics: [],
      pack_backend: "checkpoint",
      notes,
    },
  };
}

async function packAdaptiveWeak(
  input: CreatePracticeSessionRequest,
  userId: string,
): Promise<PracticePackResult> {
  const notes: string[] = [];
  const mastery = await listMastery(userId);
  const weak = weakTopicsFromMastery(mastery.items).slice(0, 5);
  const ids: string[] = [];

  for (const item of mastery.items) {
    if (ids.length >= input.limit) break;
    if (item.subject_type !== "canonical_question") continue;
    if (item.score >= 0.68) continue;
    ids.push(item.subject_id);
  }

  for (const topic of weak.map((w) => w.topic)) {
    if (ids.length >= input.limit) break;
    const listed = await listQuestions({
      topic,
      limit: Math.max(3, input.limit - ids.length),
      offset: 0,
    });
    ids.push(...listed.items.map((q) => q.id));
  }

  if (ids.length === 0) {
    const listed = await listQuestions({ limit: input.limit, offset: 0 });
    ids.push(...listed.items.map((q) => q.id));
    notes.push(
      mastery.items.length === 0
        ? "Cold-start adaptive pack — no mastery history yet."
        : "Weak topics had no teaching matches; used general bank.",
    );
  } else {
    notes.push(`Adaptive pack from ${weak.length} weak topic(s).`);
  }

  return {
    mode: "adaptive_weak",
    question_ids: uniqueIds(ids, input.limit),
    firm_context_snapshot: {
      firm_ids: input.firm_ids,
      heat_topics: [],
      pack_backend: "mastery",
      notes,
    },
  };
}

async function packRag(
  input: CreatePracticeSessionRequest,
): Promise<PracticePackResult> {
  const firmIds = input.firm_ids;
  const heat = await heatForFirms(firmIds);
  const topTopics = heat
    .slice()
    .sort((a, b) => b.intensity - a.intensity)
    .map((h) => h.topic_id)
    .filter((t) => t && t !== "untagged")
    .slice(0, 5);
  const query =
    topTopics.length > 0
      ? `Company prep: ${topTopics.slice(0, 4).join(", ")}`
      : "IB PE interview technicals accounting valuation LBO";

  const rag = await buildRealPrepRagPack({
    query,
    firm_ids: firmIds,
    weak_topics: topTopics,
    limit: input.limit,
    heat,
  });

  return {
    mode: "rag",
    question_ids: uniqueIds(rag.pack.item_ids, input.limit),
    firm_context_snapshot: snapshotFromHeat(firmIds, heat, rag.backend, [
      ...rag.notes,
      "RAG practice mode freezes cited retrieval pack at session start.",
    ]),
  };
}

async function packSimulator(
  input: CreatePracticeSessionRequest,
): Promise<PracticePackResult> {
  const firmIds = input.firm_ids;
  const heat = await heatForFirms(firmIds);
  const trackHint = heat.some((h) =>
    /lbo|pe|private|buyout/i.test(h.topic_id),
  )
    ? "pe"
    : "ib";
  const stageIds =
    trackHint === "pe"
      ? ["pe_fit", "pe_lbo", "pe_ic", "pe_portfolio"]
      : ["ib_fit", "ib_accounting", "ib_valuation", "ib_deal_judgement"];

  const stage_topic_map: Record<string, string[]> = {};
  const ids: string[] = [];
  const notes: string[] = [`Simulator track bias: ${trackHint}`];

  for (const stageId of stageIds) {
    const topics = STAGE_TOPICS[stageId] ?? [];
    stage_topic_map[stageId] = topics;
    const stageIdsCollected: string[] = [];
    for (const topic of topics) {
      if (stageIdsCollected.length >= 2) break;
      const listed = await listQuestions({
        topic,
        limit: 2,
        offset: 0,
      });
      for (const q of listed.items) {
        if (stageIdsCollected.length >= 2) break;
        stageIdsCollected.push(q.id);
      }
    }
    if (stageIdsCollected.length === 0) {
      const rag = await buildRealPrepRagPack({
        query: topics.join(" ") || stageId,
        firm_ids: firmIds,
        weak_topics: topics,
        limit: 2,
        heat,
      });
      stageIdsCollected.push(...rag.pack.item_ids);
      notes.push(`Stage ${stageId} filled via RAG.`);
    }
    ids.push(...stageIdsCollected);
  }

  return {
    mode: "simulator",
    question_ids: uniqueIds(ids, Math.max(input.limit, stageIds.length * 2)),
    firm_context_snapshot: snapshotFromHeat(firmIds, heat, "topic_list", notes),
    stage_topic_map,
  };
}

/** Build a mode-aware pack. Caller-supplied question_ids win when non-empty. */
export async function buildPracticePack(options: {
  userId: string;
  input: CreatePracticeSessionRequest;
}): Promise<PracticePackResult> {
  const mode = normalizePracticeMode(options.input.mode);
  const input = { ...options.input, mode };

  if (input.question_ids.length > 0) {
    const heat = await heatForFirms(input.firm_ids);
    return {
      mode,
      question_ids: uniqueIds(input.question_ids, input.limit),
      firm_context_snapshot: snapshotFromHeat(input.firm_ids, heat, "fallback", [
        "Caller-supplied question_ids frozen as pack membership.",
      ]),
    };
  }

  switch (mode) {
    case "company":
      return packCompany(input);
    case "concept":
      return packConcept(input);
    case "adaptive_weak":
      return packAdaptiveWeak(input, options.userId);
    case "rag":
      return packRag(input);
    case "simulator":
      return packSimulator(input);
    default:
      return packAdaptiveWeak(input, options.userId);
  }
}
