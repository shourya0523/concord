/**
 * Simulator stage → question selection (plan 2026-09-23-001 P5.8).
 *
 * The firm pack is a frozen list of question ids. Each mock stage picks the
 * first unused pack question whose topic belongs to that stage's concept
 * (STAGE_CONCEPT). When no topical match remains, the stage falls back to the
 * pack question at the stage's index (then the next unused one). A question is
 * never used by two stages.
 */

export type SimulatorStageConcept = {
  /** Concept lab slug (`/concepts/<slug>`). */
  slug: string
  title: string
  /** Topic taxonomy slugs (lib/topics.ts), most specific first. */
  topics: string[]
}

/**
 * Stage → concept + topic slugs. Topic slugs follow lib/topics.ts; legacy
 * aliases (`behavioural`, `fit`, `three_statements`, `ma`, …) are kept so
 * older packs and bank rows still match.
 */
export const STAGE_CONCEPT: Record<string, SimulatorStageConcept> = {
  ib_fit: {
    slug: "behavioural-story",
    title: "Behavioural story",
    topics: ["behavioral", "behavioural", "fit", "industry_coverage"],
  },
  ib_accounting: {
    slug: "accounting-foundations",
    title: "Accounting foundations",
    topics: ["accounting", "three_statements", "working_capital"],
  },
  ib_valuation: {
    slug: "dcf-wacc",
    title: "DCF & WACC",
    topics: ["valuation", "dcf", "wacc", "enterprise_value"],
  },
  ib_deal_judgement: {
    slug: "ev-equity-value",
    title: "EV ↔ equity value",
    topics: ["merger_models", "ma", "markets", "deal", "capital_structure", "credit"],
  },
  pe_fit: {
    slug: "behavioural-story",
    title: "Behavioural story",
    topics: ["behavioral", "behavioural", "fit", "investment_thesis"],
  },
  pe_lbo: {
    slug: "lbo-paper-lbo",
    title: "Paper LBO",
    topics: ["lbo", "returns", "paper_lbo", "capital_structure"],
  },
  pe_ic: {
    slug: "lbo-paper-lbo",
    title: "Paper LBO",
    topics: [
      "investment_thesis",
      "due_diligence",
      "investment_committee",
      "judgement",
      "deal",
      "credit",
    ],
  },
  pe_portfolio: {
    slug: "lbo-paper-lbo",
    title: "Paper LBO",
    topics: ["value_creation", "portfolio_operations", "returns", "restructuring"],
  },
}

/** Topic slugs for a stage (empty for unknown stages). */
export function stageTopics(stageId: string): string[] {
  return STAGE_CONCEPT[stageId]?.topics ?? []
}

export function normaliseTopic(topic: string | null | undefined): string | null {
  if (!topic) return null
  const slug = topic.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return slug || null
}

/** Rank of `topic` in the stage's topic list, or -1 when it does not match. */
export function stageTopicRank(stageId: string, topic: string | null | undefined): number {
  const slug = normaliseTopic(topic)
  if (!slug) return -1
  return stageTopics(stageId).indexOf(slug)
}

export type StageCandidate = { id: string; topic?: string | null }

export type StageSelection = {
  stageId: string
  questionId: string | null
  topic: string | null
  matchedBy: "topic" | "index" | "none"
}

/**
 * Pick one question per stage. Pure and deterministic: same stages and
 * candidates → same selection.
 */
export function selectStageQuestions(
  stages: ReadonlyArray<{ id: string }>,
  candidates: ReadonlyArray<StageCandidate>,
): StageSelection[] {
  const pool: StageCandidate[] = []
  const seenIds = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate.id || seenIds.has(candidate.id)) continue
    seenIds.add(candidate.id)
    pool.push(candidate)
  }

  const used = new Set<string>()
  const picks: Array<StageSelection | null> = stages.map(() => null)

  // Pass 1 — topical matches. Stages claim in order; within a stage the most
  // specific topic wins, ties broken by pack order.
  stages.forEach((stage, stageIndex) => {
    let best: { candidate: StageCandidate; rank: number } | null = null
    for (const candidate of pool) {
      if (used.has(candidate.id)) continue
      const rank = stageTopicRank(stage.id, candidate.topic)
      if (rank < 0) continue
      if (!best || rank < best.rank) best = { candidate, rank }
    }
    if (best) {
      used.add(best.candidate.id)
      picks[stageIndex] = {
        stageId: stage.id,
        questionId: best.candidate.id,
        topic: normaliseTopic(best.candidate.topic),
        matchedBy: "topic",
      }
    }
  })

  // Pass 2 — index fallback for stages with no topical match; never repeat.
  stages.forEach((stage, stageIndex) => {
    if (picks[stageIndex]) return
    const ordered = [...pool.slice(stageIndex), ...pool.slice(0, stageIndex)]
    const fallback = ordered.find((candidate) => !used.has(candidate.id))
    if (fallback) {
      used.add(fallback.id)
      picks[stageIndex] = {
        stageId: stage.id,
        questionId: fallback.id,
        topic: normaliseTopic(fallback.topic),
        matchedBy: "index",
      }
    } else {
      picks[stageIndex] = { stageId: stage.id, questionId: null, topic: null, matchedBy: "none" }
    }
  })

  return picks as StageSelection[]
}

/** Stage whose topics best match a question topic (report fallback mapping). */
export function stageForTopic(
  stageIds: ReadonlyArray<string>,
  topic: string | null | undefined,
): string | null {
  let best: { id: string; rank: number } | null = null
  for (const id of stageIds) {
    const rank = stageTopicRank(id, topic)
    if (rank < 0) continue
    if (!best || rank < best.rank) best = { id, rank }
  }
  return best?.id ?? null
}
