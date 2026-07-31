/**
 * Pure weak-topic derivation (no server deps — safe for client islands).
 */
import type { Mastery } from "@ibpe/contracts"
import { topicForConceptId } from "@/lib/topics"

export type WeakTopic = {
  topic: string
  concept_id: string | null
  score: number
  reason: string
}

export const WEAK_THRESHOLD = 0.68

/**
 * Weak topics derived from real mastery records (concept-level), never a
 * hardcoded list. Empty for new users — flows must handle that honestly.
 */
export function weakTopicsFromMastery(
  items: Array<Pick<Mastery, "subject_type" | "subject_id" | "score">>,
): WeakTopic[] {
  const byTopic = new Map<string, WeakTopic>()
  for (const item of items) {
    if (item.subject_type !== "concept" || item.score >= WEAK_THRESHOLD) continue
    const topic = topicForConceptId(item.subject_id)
    if (!topic) continue
    const existing = byTopic.get(topic)
    if (existing && existing.score <= item.score) continue
    byTopic.set(topic, {
      topic,
      concept_id: item.subject_id,
      score: item.score,
      reason: `Mastery ${Math.round(item.score * 100)}% — below proficient (${WEAK_THRESHOLD * 100}%)`,
    })
  }
  return [...byTopic.values()].sort((a, b) => a.score - b.score)
}
