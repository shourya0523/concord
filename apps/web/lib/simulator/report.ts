/**
 * Simulator after-action report (plan 2026-09-23-001 P5.8). Pure aggregation
 * of a mock's graded attempts into per-stage scores, strongest / weakest
 * topics, recommended concepts and a deterministic, cited summary.
 *
 * Citations are restricted to teaching answer ids (from the attempts' grades)
 * and heat topic ids (`heat:<firm_id>:<topic_id>`) from the session's
 * firm_context_snapshot. Heat is a firm *signal* (ADR 0002): it is cited to
 * explain priority, never quoted as an answer.
 */
import { topicLabel } from "@/lib/topics"
import { STAGE_CONCEPT, normaliseTopic, stageForTopic, stageTopics } from "./select"

export type ReportCitationKind = "teaching_answer" | "heat_topic"

export type ReportCitation = { id: string; kind: ReportCitationKind; label?: string }

export type ReportAttempt = {
  question_id: string
  score: number | null
  score_source: string | null
  feedback?: string | null
  weak_topics?: string[]
  citations?: Array<{ id: string; kind: string; label?: string }>
  topic?: string | null
  created_at?: string | null
}

export type ReportStageInput = {
  id: string
  label: string
  question_id?: string | null
  topic?: string | null
}

export type HeatTopicInput = {
  firm_id: string
  topic_id: string
  intensity: number
  sample_size?: number
}

export type MockReportStage = {
  stage_id: string
  label: string
  question_id: string | null
  topic: string | null
  score: number | null
  score_source: string | null
  feedback: string | null
  weak_topics: string[]
  follow_up_score: number | null
}

export type TopicScore = { topic: string; label: string; score: number }

export type RecommendedConcept = {
  slug: string
  title: string
  topic: string | null
  reason: string
  citation_ids: string[]
}

export type MockReport = {
  overall_score: number | null
  graded_stages: number
  stages: MockReportStage[]
  strongest_topics: TopicScore[]
  weakest_topics: TopicScore[]
  recommended_concepts: RecommendedConcept[]
  summary: string
  summary_source: "deterministic" | "llm"
  citations: ReportCitation[]
}

const STRONG_AT = 0.7
const WEAK_BELOW = 0.7

export function heatCitationId(heat: { firm_id: string; topic_id: string }): string {
  return `heat:${heat.firm_id}:${heat.topic_id}`
}

function pct(score: number): string {
  return `${Math.round(score * 100)}%`
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Effective score of one attempt for the report (reveal copies earn nothing). */
export function attemptReportScore(attempt: ReportAttempt): number | null {
  if (attempt.score == null || !Number.isFinite(attempt.score)) return null
  if (attempt.score_source === "reveal_copy") return 0
  return Math.min(1, Math.max(0, attempt.score))
}

function groupAttempts(attempts: ReportAttempt[]): Map<string, ReportAttempt[]> {
  const sorted = attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort(
      (a, b) =>
        (a.attempt.created_at ?? "").localeCompare(b.attempt.created_at ?? "") || a.index - b.index,
    )
  const groups = new Map<string, ReportAttempt[]>()
  for (const { attempt } of sorted) {
    const list = groups.get(attempt.question_id) ?? []
    list.push(attempt)
    groups.set(attempt.question_id, list)
  }
  return groups
}

/** Heat rows for a topic, hottest first. */
function heatFor(topic: string | null, heat: HeatTopicInput[]): HeatTopicInput[] {
  if (!topic) return []
  return heat
    .filter((row) => normaliseTopic(row.topic_id) === topic)
    .sort((a, b) => b.intensity - a.intensity)
}

export function buildMockReport(input: {
  stages: ReportStageInput[]
  attempts: ReportAttempt[]
  heatTopics?: HeatTopicInput[]
  firmName?: string | null
}): MockReport {
  const heat = input.heatTopics ?? []
  const groups = groupAttempts(input.attempts)
  const claimed = new Set<string>()
  const stageIds = input.stages.map((stage) => stage.id)

  // Stage ↔ question: explicit mapping first, then topic match for leftovers.
  const questionForStage = new Map<string, string>()
  for (const stage of input.stages) {
    if (stage.question_id && groups.has(stage.question_id) && !claimed.has(stage.question_id)) {
      questionForStage.set(stage.id, stage.question_id)
      claimed.add(stage.question_id)
    }
  }
  for (const [questionId, list] of groups) {
    if (claimed.has(questionId)) continue
    const topic = normaliseTopic(list[0]?.topic)
    const open = stageIds.filter((id) => !questionForStage.has(id))
    const stageId = stageForTopic(open, topic)
    if (stageId) {
      questionForStage.set(stageId, questionId)
      claimed.add(questionId)
    }
  }

  const stages: MockReportStage[] = input.stages.map((stage) => {
    const questionId = questionForStage.get(stage.id) ?? stage.question_id ?? null
    const list = questionId ? groups.get(questionId) ?? [] : []
    const primary = list[0]
    const followUp = list.length > 1 ? list[list.length - 1] : undefined
    const topic =
      normaliseTopic(primary?.topic) ?? normaliseTopic(stage.topic) ?? stageTopics(stage.id)[0] ?? null
    return {
      stage_id: stage.id,
      label: stage.label,
      question_id: questionId,
      topic,
      score: primary ? attemptReportScore(primary) : null,
      score_source: primary?.score_source ?? null,
      feedback: primary?.feedback?.trim() || null,
      weak_topics: (primary?.weak_topics ?? []).map((t) => normaliseTopic(t)).filter(Boolean) as string[],
      follow_up_score: followUp ? attemptReportScore(followUp) : null,
    }
  })

  const graded = stages.filter((stage) => stage.score != null)
  const overall = mean(graded.map((stage) => stage.score as number))

  // Topic roll-up: the stage's topic carries the stage score; grader weak
  // topics carry it too (capped below the weak threshold).
  const topicScores = new Map<string, number[]>()
  for (const stage of graded) {
    const score = stage.score as number
    if (stage.topic) topicScores.set(stage.topic, [...(topicScores.get(stage.topic) ?? []), score])
    for (const weak of stage.weak_topics) {
      if (weak === stage.topic) continue
      topicScores.set(weak, [...(topicScores.get(weak) ?? []), Math.min(score, WEAK_BELOW - 0.01)])
    }
  }
  const topics: TopicScore[] = [...topicScores.entries()].map(([topic, scores]) => ({
    topic,
    label: topicLabel(topic),
    score: mean(scores) as number,
  }))
  const strongest = topics
    .filter((row) => row.score >= STRONG_AT)
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, 3)
  const weakest = topics
    .filter((row) => row.score < WEAK_BELOW)
    .sort((a, b) => a.score - b.score || a.topic.localeCompare(b.topic))
    .slice(0, 3)

  // Recommended concepts: weak (or ungraded) stages, hottest firm topic first.
  const recommendations = new Map<string, RecommendedConcept & { order: number }>()
  const weakStages = stages
    .filter((stage) => stage.score == null || stage.score < WEAK_BELOW)
    .map((stage) => ({
      stage,
      heat: heatFor(stage.topic, heat)[0] ?? null,
    }))
    .sort(
      (a, b) =>
        (b.heat?.intensity ?? 0) - (a.heat?.intensity ?? 0) ||
        (a.stage.score ?? -1) - (b.stage.score ?? -1),
    )
  weakStages.forEach(({ stage, heat: hot }, order) => {
    const concept = STAGE_CONCEPT[stage.stage_id]
    if (!concept || recommendations.has(concept.slug)) return
    const scoreText = stage.score == null ? "was not graded" : `scored ${pct(stage.score)}`
    const heatText = hot
      ? ` ${topicLabel(hot.topic_id)} is a frequent topic for ${input.firmName ?? "this firm"} [${heatCitationId(hot)}].`
      : ""
    recommendations.set(concept.slug, {
      slug: concept.slug,
      title: concept.title,
      topic: stage.topic,
      reason: `${stage.label} ${scoreText}.${heatText}`,
      citation_ids: hot ? [heatCitationId(hot)] : [],
      order,
    })
  })
  const recommended = [...recommendations.values()]
    .sort((a, b) => a.order - b.order)
    .map(
      (row): RecommendedConcept => ({
        slug: row.slug,
        title: row.title,
        topic: row.topic,
        reason: row.reason,
        citation_ids: row.citation_ids,
      }),
    )

  const citations = collectCitations({ attempts: input.attempts, stages, heat, weakest, strongest })

  return {
    overall_score: overall == null ? null : Math.round(overall * 100) / 100,
    graded_stages: graded.length,
    stages,
    strongest_topics: strongest,
    weakest_topics: weakest,
    recommended_concepts: recommended,
    summary: deterministicSummary({
      stages,
      overall,
      strongest,
      weakest,
      recommended,
      heat,
      attempts: input.attempts,
      firmName: input.firmName ?? null,
    }),
    summary_source: "deterministic",
    citations,
  }
}

/** Teaching answer ids from the graded attempts, in stage order. */
export function teachingCitations(
  attempts: ReportAttempt[],
  stages?: MockReportStage[],
): ReportCitation[] {
  const order = new Map((stages ?? []).map((stage, index) => [stage.question_id, index]))
  const out = new Map<string, ReportCitation>()
  const sorted = [...attempts].sort(
    (a, b) => (order.get(a.question_id) ?? 99) - (order.get(b.question_id) ?? 99),
  )
  for (const attempt of sorted) {
    for (const citation of attempt.citations ?? []) {
      if (citation.kind !== "teaching_answer" || !citation.id || out.has(citation.id)) continue
      out.set(citation.id, { id: citation.id, kind: "teaching_answer", label: citation.label })
    }
  }
  return [...out.values()]
}

/** Every id the coaching paragraph may cite. */
export function allowedCitations(input: {
  attempts: ReportAttempt[]
  heatTopics: HeatTopicInput[]
}): ReportCitation[] {
  const heat = input.heatTopics.map((row) => ({
    id: heatCitationId(row),
    kind: "heat_topic" as const,
    label: topicLabel(row.topic_id),
  }))
  return [...teachingCitations(input.attempts), ...heat]
}

function collectCitations(input: {
  attempts: ReportAttempt[]
  stages: MockReportStage[]
  heat: HeatTopicInput[]
  weakest: TopicScore[]
  strongest: TopicScore[]
}): ReportCitation[] {
  const out = new Map<string, ReportCitation>()
  for (const citation of teachingCitations(input.attempts, input.stages)) out.set(citation.id, citation)
  const topics = new Set([...input.weakest, ...input.strongest].map((row) => row.topic))
  for (const stage of input.stages) if (stage.topic) topics.add(stage.topic)
  for (const topic of topics) {
    const hot = heatFor(topic, input.heat)[0]
    if (!hot) continue
    const id = heatCitationId(hot)
    out.set(id, { id, kind: "heat_topic", label: topicLabel(hot.topic_id) })
  }
  return [...out.values()]
}

function deterministicSummary(input: {
  stages: MockReportStage[]
  overall: number | null
  strongest: TopicScore[]
  weakest: TopicScore[]
  recommended: RecommendedConcept[]
  heat: HeatTopicInput[]
  attempts: ReportAttempt[]
  firmName: string | null
}): string {
  const graded = input.stages.filter((stage) => stage.score != null)
  if (input.overall == null || graded.length === 0) {
    return "No stages were graded in this mock — answer each stage in writing (or by voice) to get a scored debrief."
  }
  const sentences: string[] = []
  sentences.push(
    `Overall ${pct(input.overall)} across ${graded.length} graded stage${graded.length === 1 ? "" : "s"}${
      input.firmName ? ` of your ${input.firmName} mock` : ""
    }.`,
  )
  const strong = input.strongest[0]
  if (strong) {
    sentences.push(`Strongest: ${strong.label} (${pct(strong.score)}).`)
  }
  const weak = input.weakest[0]
  if (weak) {
    const hot = heatFor(weak.topic, input.heat)[0]
    const weakStage = input.stages.find((stage) => stage.topic === weak.topic)
    const teaching = weakStage
      ? teachingCitations(input.attempts.filter((a) => a.question_id === weakStage.question_id))[0]
      : undefined
    const cites = [teaching?.id, hot ? heatCitationId(hot) : undefined].filter(Boolean)
    sentences.push(
      `Weakest: ${weak.label} (${pct(weak.score)})${
        hot ? ` — a frequent topic at ${input.firmName ?? "this firm"}` : ""
      }; re-read the teaching answer before your next rep${cites.length ? ` ${cites.map((id) => `[${id}]`).join(" ")}` : ""}.`,
    )
  }
  const next = input.recommended[0]
  if (next) sentences.push(`Next: the ${next.title} lab, then re-run this mock.`)
  else sentences.push("Next: keep cadence with a fresh firm pack next week.")
  return sentences.join(" ")
}
