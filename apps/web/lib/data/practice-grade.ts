/**
 * Practice attempt grading: teaching Answer = gold; Glassdoor heat = cite-only firm context.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { DEFAULT_RAG_GENERATE_MODEL, googleApiKey } from "@ibpe/ai";
import type { AttemptGradeCitation } from "@ibpe/contracts";
import { generateObject } from "ai";
import { z } from "zod";
import { getQuestion } from "@/lib/data/questions";
import type { FirmContextSnapshot } from "@/lib/data/practice-packs";
import {
  gradeDeterministic,
  selfGrade,
  type PracticeGradeResult,
} from "@/lib/practice-grade-core";

export type { PracticeGradeResult };
export { gradeDeterministic, selfGrade };

const LlmGradeSchema = z.object({
  score: z.number().min(0).max(1),
  correct: z.boolean(),
  feedback: z.string(),
  weak_topics: z.array(z.string()).default([]),
  key_points_hit: z.array(z.string()).default([]),
  firm_alignment_note: z.string().optional(),
  citation_ids: z.array(z.string()).default([]),
});

async function gradeWithLlm(options: {
  questionWording: string;
  responseText: string;
  goldConcise: string;
  goldExpanded: string;
  commonMistakes: string[];
  answerId: string;
  heatTopics: FirmContextSnapshot["heat_topics"];
  topic?: string | null;
}): Promise<PracticeGradeResult | null> {
  const apiKey = googleApiKey();
  if (!apiKey) return null;

  const allowed = new Set<string>([options.answerId]);
  for (const h of options.heatTopics.slice(0, 6)) {
    allowed.add(`heat:${h.firm_id}:${h.topic_id}`);
  }

  const heatBlock = options.heatTopics
    .slice(0, 6)
    .map(
      (h) =>
        `ID: heat:${h.firm_id}:${h.topic_id}\nTopic: ${h.topic_id}\nIntensity: ${h.intensity}\nSamples: ${h.sample_size}`,
    )
    .join("\n\n");

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { object } = await generateObject({
      model: google(DEFAULT_RAG_GENERATE_MODEL),
      schema: LlmGradeSchema,
      temperature: 0.2,
      system:
        "You grade IB/PE interview answers. Teaching answer text is the only gold standard. Glassdoor firm heat IDs are retrieval/coaching context only — never treat them as correct answers. Every firm-specific claim in feedback must reference a heat:* citation id. citation_ids must be chosen from the allowed id list.",
      prompt: `QUESTION:
${options.questionWording}

CANDIDATE ANSWER:
${options.responseText}

TEACHING GOLD (id=${options.answerId}):
Concise: ${options.goldConcise}
Expanded: ${options.goldExpanded.slice(0, 1200)}
Common mistakes: ${options.commonMistakes.slice(0, 6).join(" | ") || "n/a"}

FIRM HEAT CONTEXT (signals only):
${heatBlock || "none"}

ALLOWED citation_ids: ${[...allowed].join(", ")}

Return score 0-1, correct boolean, short feedback, weak_topics, key_points_hit, optional firm_alignment_note, and citation_ids subset of ALLOWED.`,
    });

    const citation_ids = object.citation_ids.filter((id) => allowed.has(id));
    const citations: AttemptGradeCitation[] = citation_ids.map((id) => {
      if (id === options.answerId) {
        return { id, kind: "teaching_answer" as const, label: "Teaching answer" };
      }
      const heat = options.heatTopics.find(
        (h) => `heat:${h.firm_id}:${h.topic_id}` === id,
      );
      return {
        id,
        kind: "heat_topic" as const,
        label: heat?.topic_id ?? id,
      };
    });
    if (!citations.some((c) => c.kind === "teaching_answer")) {
      citations.unshift({
        id: options.answerId,
        kind: "teaching_answer",
        label: "Teaching answer",
      });
    }

    return {
      score: object.score,
      correct: object.correct,
      score_source: "llm",
      feedback: object.feedback,
      weak_topics:
        object.weak_topics.length > 0
          ? object.weak_topics
          : options.topic && object.score < 0.68
            ? [options.topic]
            : [],
      citations,
      rubric_json: {
        key_points_hit: object.key_points_hit,
        firm_alignment_note: object.firm_alignment_note ?? null,
        citation_ids,
      },
      answer_id: options.answerId,
    };
  } catch (err) {
    console.warn("[practice-grade] LLM grade failed", err);
    return null;
  }
}

export async function gradePracticeAttempt(options: {
  questionId: string;
  responseText?: string | null;
  correct?: boolean | null;
  confidence?: number | null;
  firmContext?: FirmContextSnapshot | null;
}): Promise<PracticeGradeResult> {
  const responseText = options.responseText?.trim() ?? "";
  const detail = await getQuestion(options.questionId, { includeStudy: true });
  const topic = detail?.question.topic ?? null;

  if (!responseText) {
    return selfGrade({
      correct: options.correct,
      confidence: options.confidence,
      topic,
    });
  }

  const study = detail?.study;
  const goldConcise = study?.direct_answer?.trim() ?? "";
  const goldExpanded = study?.interview_ready_explanation?.trim() ?? "";
  const heatTopics = options.firmContext?.heat_topics ?? [];

  if (!goldConcise && !goldExpanded) {
    const self = selfGrade({
      correct: options.correct,
      confidence: options.confidence,
      topic,
    });
    return {
      ...self,
      feedback: "No teaching answer available — kept self/confidence score.",
    };
  }

  const llm = await gradeWithLlm({
    questionWording: detail?.question.canonical_wording ?? options.questionId,
    responseText,
    goldConcise,
    goldExpanded,
    commonMistakes: study?.common_mistakes ?? [],
    answerId: study?.answer_id ?? `answer:${options.questionId}`,
    heatTopics,
    topic,
  });
  if (llm) return llm;

  return gradeDeterministic({
    responseText,
    goldConcise,
    goldExpanded,
    commonMistakes: study?.common_mistakes ?? [],
    formulae: study?.formulae ?? [],
    topic,
    answerId: study?.answer_id ?? null,
    heatTopics,
  });
}
