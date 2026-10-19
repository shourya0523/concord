/**
 * Placement check (plan 2026-09-23-001 P4.6): 10 questions across the core
 * concepts and a spread of difficulty, answered once during onboarding. Each
 * answer goes through the normal attempts API, which seeds the review queue
 * and question mastery; readiness rolls that up to concepts on day 1.
 */
import { inferTopic } from "@ibpe/search"
import type { PlacementQuestion, PlacementResponse } from "@/lib/api/retention-schemas"
import { isDatabaseConfigured, requireSql } from "@/lib/db/client"
import { conceptIdForTopic } from "@/lib/topics"
import { loadBankQuestions } from "./bank-fallback"
import { getPrepProfile, putPrepProfile } from "./profile"

export const PLACEMENT_SIZE = 10
/** Core concepts first; each gets an easier and a harder question. */
export const PLACEMENT_TOPICS = [
  "accounting",
  "enterprise_value",
  "valuation",
  "lbo",
  "merger_models",
] as const

const DIFFICULTY_RANK: Record<string, number> = {
  easy: 0,
  beginner: 0,
  medium: 1,
  intermediate: 1,
  hard: 2,
  advanced: 2,
}

function rank(difficulty: string | null): number {
  return difficulty ? (DIFFICULTY_RANK[difficulty.toLowerCase()] ?? 1) : 1
}

/**
 * Pick `size` questions: per core topic the easiest and the hardest available,
 * then round-robin over what is left (core topics first) until full.
 */
export function pickPlacement(
  pool: PlacementQuestion[],
  topics: readonly string[] = PLACEMENT_TOPICS,
  size = PLACEMENT_SIZE,
): PlacementQuestion[] {
  const byTopic = new Map<string, PlacementQuestion[]>()
  for (const question of pool) {
    const key = question.topic ?? "other"
    const list = byTopic.get(key) ?? []
    if (!list.some((q) => q.question_id === question.question_id)) list.push(question)
    byTopic.set(key, list)
  }
  for (const list of byTopic.values()) list.sort((a, b) => rank(a.difficulty) - rank(b.difficulty))

  const chosen: PlacementQuestion[] = []
  const used = new Set<string>()
  const take = (question: PlacementQuestion | undefined) => {
    if (!question || used.has(question.question_id) || chosen.length >= size) return
    used.add(question.question_id)
    chosen.push(question)
  }
  for (const topic of topics) {
    const list = byTopic.get(topic) ?? []
    take(list[0])
    take(list[list.length - 1])
  }
  const order = [...topics, ...[...byTopic.keys()].filter((key) => !topics.includes(key)).sort()]
  let progressed = true
  while (chosen.length < size && progressed) {
    progressed = false
    for (const topic of order) {
      const next = (byTopic.get(topic) ?? []).find((q) => !used.has(q.question_id))
      if (next) {
        take(next)
        progressed = true
      }
    }
  }
  return chosen
}

function toPlacement(row: { id: string; prompt: string; topic: string | null; difficulty: string | null }): PlacementQuestion {
  return {
    question_id: row.id,
    prompt: row.prompt,
    topic: row.topic,
    concept_id: row.topic ? conceptIdForTopic(row.topic) : null,
    difficulty: row.difficulty,
  }
}

export async function getPlacementQuestions(userId: string): Promise<PlacementResponse> {
  const { profile } = await getPrepProfile(userId)
  const completedAt = profile.placement_completed_at

  if (isDatabaseConfigured()) {
    try {
      const sql = requireSql()
      const rows = (await sql`
        SELECT id, canonical_wording, topic, difficulty
        FROM published.v_questions
        WHERE topic = ANY(${[...PLACEMENT_TOPICS]}::text[])
        ORDER BY random()
        LIMIT 200
      `) as Array<{ id: string; canonical_wording: string; topic: string | null; difficulty: string | null }>
      let pool = rows.map((row) => toPlacement({ ...row, prompt: row.canonical_wording }))
      if (pool.length < PLACEMENT_SIZE) {
        const extra = (await sql`
          SELECT id, canonical_wording, topic, difficulty
          FROM published.v_questions
          ORDER BY random()
          LIMIT 40
        `) as typeof rows
        pool = [...pool, ...extra.map((row) => toPlacement({ ...row, prompt: row.canonical_wording }))]
      }
      const questions = pickPlacement(pool)
      if (questions.length > 0) {
        return { questions, completed_at: completedAt, source: "published" }
      }
    } catch (err) {
      console.warn("[placement] published question read failed; using local bank", err)
    }
  }

  // Local bank: topics inferred from wording (firm-signal prompts, ADR 0002 —
  // grading still uses teaching answers where they exist).
  const bank = await loadBankQuestions()
  const pool: PlacementQuestion[] = []
  for (const row of bank) {
    const topic = inferTopic(row.question)
    if (!topic || topic === "untagged" || topic === "behavioral") continue
    pool.push(toPlacement({ id: row.id, prompt: row.question, topic, difficulty: null }))
    if (pool.length >= 400) break
  }
  const questions = pickPlacement(pool)
  return questions.length > 0
    ? {
        questions,
        completed_at: completedAt,
        source: "bank_fallback",
        note: "Published corpus unavailable — placement drawn from the local question bank.",
      }
    : {
        questions: [],
        completed_at: completedAt,
        source: "empty",
        note: "No questions available for a placement check yet — you can skip it.",
      }
}

/** Record that placement was finished or skipped (merged into the profile). */
export async function completePlacement(options: {
  userId: string
  email?: string | null
  now?: Date
}): Promise<string> {
  const at = (options.now ?? new Date()).toISOString()
  await putPrepProfile({
    userId: options.userId,
    email: options.email,
    input: { placement_completed_at: at },
  })
  return at
}
