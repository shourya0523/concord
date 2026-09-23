/**
 * Numeric drill templates (plan 2026-09-23-001 P2.8). Pure + seeded: the same
 * (template_id, seed) always yields the same prompt, inputs and answer, so an
 * attempt can be re-graded exactly.
 *
 * Foundation stub — the drills track replaces the template registry.
 */

export type DrillDifficulty = "easy" | "medium" | "hard"
export type ToleranceKind = "relative" | "absolute"

export type DrillTemplateMeta = {
  id: string
  title: string
  topic: string
  concept_id: string | null
  difficulty: DrillDifficulty
}

export type GeneratedDrill = {
  instance: {
    id: string
    template_id: string
    seed: string
    topic: string
    concept_id: string | null
    difficulty: DrillDifficulty
    prompt: string
    inputs: Record<string, unknown>
    unit: string | null
  }
  solution: {
    answer: number
    unit: string | null
    tolerance: number
    tolerance_kind: ToleranceKind
    explanation: string
  }
}

export function listDrillTemplates(): DrillTemplateMeta[] {
  return []
}

export function generateDrill(_templateId: string, _seed: string): GeneratedDrill | null {
  return null
}

/** Parse `drill:<template_id>:<seed>`. */
export function parseDrillId(id: string): { templateId: string; seed: string } | null {
  const match = /^drill:([a-z0-9_]+):([A-Za-z0-9_-]+)$/.exec(id)
  return match ? { templateId: match[1] as string, seed: match[2] as string } : null
}
