/**
 * Curriculum source types (P2.9 / P2.10 / P7.2).
 *
 * The files in this folder are the single source of truth for the Mode B
 * curriculum: `scripts/curriculum/build-migrations.ts` renders them into
 * migrations 059–061, and `lib/data/learning.ts` serves them as the no-DB
 * stub fallback, so both modes show the same modules, lessons and diagrams.
 *
 * Keep these files free of runtime imports (plain data) so the build script
 * can import them with tsx outside Next.js.
 */

export type CurriculumDiagram = {
  id: string
  slug: string
  title: string
  diagram_type: "finance-flow" | "finance-quiz" | "finance-chart"
  format: "mermaid" | "interactive-json"
  /** Version label written to canonical.diagram_versions.version. */
  version: string
  /** Mermaid source, or JSON text for interactive-json. */
  body: string
  /** Screen-reader / reduced-motion description (canonical.diagrams.a11y_fallback). */
  a11y: string
  /** Topic slugs (lib/topics.ts) used for question → diagram fallback links. */
  topics: string[]
  concept_ids: string[]
}

export type CurriculumCheckpointKind =
  | "lesson"
  | "concept_lab"
  | "drill"
  | "quiz"
  | "diagram"

export type CurriculumCheckpoint = {
  id: string
  kind: CurriculumCheckpointKind
  title: string
  position: number
  concept_id: string
  diagram_id?: string | null
  /** ≥ 3 canonical question ids that exist in exports/questions.jsonl. */
  question_ids: string[]
  /** Lesson / concept-lab body (300–700 words). */
  body_markdown?: string | null
  /** e.g. {"mode":"quiz"} for interactive diagram checkpoints. */
  metadata?: Record<string, unknown>
}

export type CurriculumModule = {
  id: string
  slug: string
  title: string
  summary: string
  track: "IB" | "PE"
  domain: "ib" | "pe" | "both"
  estimated_minutes: number
  order: number
  level: "foundation" | "core" | "advanced"
  concept_id: string
  prereq_module_ids: string[]
  checkpoints: CurriculumCheckpoint[]
}

export type CurriculumConcept = {
  id: string
  slug: string
  title: string
  summary: string
  track: "IB" | "PE"
  domain: "ib" | "pe" | "both"
  prerequisites: string[]
}
