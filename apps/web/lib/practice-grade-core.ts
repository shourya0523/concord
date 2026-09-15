/**
 * Pure practice grading helpers (no server / path-alias imports).
 */
import type {
  AttemptGradeCitation,
  AttemptScoreSource,
} from "@ibpe/contracts"

export type HeatTopicCue = {
  firm_id: string
  topic_id: string
  intensity: number
  sample_size: number
}

export type PracticeGradeResult = {
  score: number
  correct: boolean | null
  score_source: AttemptScoreSource
  feedback: string
  weak_topics: string[]
  citations: AttemptGradeCitation[]
  rubric_json: Record<string, unknown>
  answer_id: string | null
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "are",
  "be",
  "as",
  "with",
  "that",
  "this",
  "it",
  "you",
  "your",
  "from",
  "by",
  "at",
  "we",
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

/** Deterministic overlap + optional numeric cue checks (no LLM). */
export function gradeDeterministic(options: {
  responseText: string
  goldConcise: string
  goldExpanded?: string
  commonMistakes?: string[]
  formulae?: string[]
  topic?: string | null
  answerId?: string | null
  heatTopics?: HeatTopicCue[]
}): PracticeGradeResult {
  const response = options.responseText.trim()
  const gold = `${options.goldConcise}\n${options.goldExpanded ?? ""}`
  const goldToks = [...new Set(tokens(gold))]
  const respToks = new Set(tokens(response))
  const hit = goldToks.filter((t) => respToks.has(t))
  const coverage =
    goldToks.length === 0 ? 0 : hit.length / Math.min(goldToks.length, 24)

  let score = Math.max(0, Math.min(1, coverage))
  const formulae = options.formulae ?? []
  if (formulae.length > 0) {
    const formulaHit = formulae.some((f) =>
      tokens(f).some((t) => respToks.has(t) || response.includes(t)),
    )
    if (formulaHit) score = Math.min(1, score + 0.15)
  }

  const mistakes = options.commonMistakes ?? []
  const mistakeHit = mistakes.some((m) => {
    const mt = tokens(m).slice(0, 4)
    return mt.length > 0 && mt.every((t) => respToks.has(t))
  })
  if (mistakeHit) score = Math.max(0, score - 0.2)

  const citations: AttemptGradeCitation[] = []
  if (options.answerId) {
    citations.push({
      id: options.answerId,
      kind: "teaching_answer",
      label: "Teaching answer",
    })
  }
  for (const h of (options.heatTopics ?? []).slice(0, 3)) {
    citations.push({
      id: `heat:${h.firm_id}:${h.topic_id}`,
      kind: "heat_topic",
      label: `${h.topic_id} (intensity ${h.intensity.toFixed(2)})`,
    })
  }

  const weak_topics: string[] = []
  if (score < 0.68 && options.topic) weak_topics.push(options.topic)

  const firmNote =
    citations.find((c) => c.kind === "heat_topic") && score < 0.85
      ? ` Firm heat context suggests emphasis on ${citations
          .filter((c) => c.kind === "heat_topic")
          .map((c) => c.label)
          .join("; ")} — coaching only, not gold answers.`
      : ""

  return {
    score: Number(score.toFixed(3)),
    correct: score >= 0.68,
    score_source: "deterministic",
    feedback:
      `Coverage vs teaching answer ~${Math.round(score * 100)}%.` +
      (hit.length ? ` Matched cues: ${hit.slice(0, 8).join(", ")}.` : "") +
      firmNote,
    weak_topics,
    citations,
    rubric_json: {
      coverage,
      matched_cues: hit.slice(0, 16),
      mistake_flag: mistakeHit,
    },
    answer_id: options.answerId ?? null,
  }
}

export function selfGrade(options: {
  correct?: boolean | null
  confidence?: number | null
  topic?: string | null
}): PracticeGradeResult {
  const score =
    options.correct === true
      ? 1
      : options.correct === false
        ? 0.25
        : options.confidence == null
          ? 0.5
          : options.confidence
  return {
    score,
    correct: options.correct ?? null,
    score_source: "self",
    feedback: "Self-rated attempt (no response text or grader unavailable).",
    weak_topics: score < 0.68 && options.topic ? [options.topic] : [],
    citations: [],
    rubric_json: { self: true },
    answer_id: null,
  }
}
