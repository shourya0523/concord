import { parseInteractiveDiagram } from "@ibpe/contracts"
import { MERMAID_DIAGRAMS } from "./diagrams"
import { INTERACTIVE_DIAGRAMS } from "./interactive-diagrams"
import { CURRICULUM_CONCEPTS, CURRICULUM_MODULES } from "./modules"
import type { CurriculumDiagram } from "./types"

export { CURRICULUM_CONCEPTS, CURRICULUM_MODULES, INTERACTIVE_DIAGRAMS, MERMAID_DIAGRAMS }
export type * from "./types"

export const CURRICULUM_DIAGRAMS: CurriculumDiagram[] = [
  ...MERMAID_DIAGRAMS,
  ...INTERACTIVE_DIAGRAMS,
]

export const LESSON_MIN_WORDS = 300
export const LESSON_MAX_WORDS = 700
export const MIN_CHECKPOINT_QUESTIONS = 3

/** Word count of markdown prose (tables and punctuation-only tokens ignored). */
export function markdownWordCount(markdown: string): number {
  return markdown
    .replace(/^\|?\s*-{3,}.*$/gm, " ")
    .replace(/[#>*`|]/g, " ")
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length
}

/**
 * Structural checks shared by curriculum.test.ts and the migration builder.
 * `questionIds` is the id set from exports/questions.jsonl.
 */
export function validateCurriculum(questionIds: Set<string>): string[] {
  const errors: string[] = []
  const diagramIds = new Set<string>()
  const conceptIds = new Set(CURRICULUM_CONCEPTS.map((c) => c.id))

  for (const diagram of CURRICULUM_DIAGRAMS) {
    if (diagramIds.has(diagram.id)) errors.push(`duplicate diagram id ${diagram.id}`)
    diagramIds.add(diagram.id)
    if (!diagram.a11y || diagram.a11y.length < 60) {
      errors.push(`${diagram.id}: a11y fallback too short`)
    }
    if (diagram.format === "interactive-json" && !parseInteractiveDiagram(diagram.body)) {
      errors.push(`${diagram.id}: interactive-json body fails InteractiveDiagramSchema`)
    }
    if (diagram.format === "mermaid" && !/^(flowchart|graph) (LR|TB|TD|RL|BT)\n/.test(diagram.body)) {
      errors.push(`${diagram.id}: mermaid body must start with a flowchart header`)
    }
    if (diagram.format === "mermaid" && /;/.test(diagram.body)) {
      errors.push(`${diagram.id}: keep semicolons out of mermaid bodies`)
    }
    for (const conceptId of diagram.concept_ids) {
      if (!conceptIds.has(conceptId)) errors.push(`${diagram.id}: unknown concept ${conceptId}`)
    }
  }

  const checkpointIds = new Set<string>()
  const moduleIds = new Set(CURRICULUM_MODULES.map((m) => m.id))
  for (const learningModule of CURRICULUM_MODULES) {
    if (!conceptIds.has(learningModule.concept_id)) {
      errors.push(`${learningModule.id}: unknown concept ${learningModule.concept_id}`)
    }
    for (const prereq of learningModule.prereq_module_ids) {
      if (!moduleIds.has(prereq)) errors.push(`${learningModule.id}: unknown prereq ${prereq}`)
    }
    const positions = new Set<number>()
    const moduleQuestions = new Map<string, string>()
    for (const checkpoint of learningModule.checkpoints) {
      const where = `${learningModule.id}/${checkpoint.id}`
      if (checkpointIds.has(checkpoint.id)) errors.push(`duplicate checkpoint id ${checkpoint.id}`)
      checkpointIds.add(checkpoint.id)
      if (positions.has(checkpoint.position)) errors.push(`${where}: duplicate position`)
      positions.add(checkpoint.position)
      if (checkpoint.question_ids.length < MIN_CHECKPOINT_QUESTIONS) {
        errors.push(`${where}: needs ≥${MIN_CHECKPOINT_QUESTIONS} question ids`)
      }
      if (new Set(checkpoint.question_ids).size !== checkpoint.question_ids.length) {
        errors.push(`${where}: duplicate question id inside checkpoint`)
      }
      for (const questionId of checkpoint.question_ids) {
        if (!questionIds.has(questionId)) errors.push(`${where}: ${questionId} not in exports`)
        const other = moduleQuestions.get(questionId)
        if (other) errors.push(`${where}: ${questionId} already used by ${other}`)
        moduleQuestions.set(questionId, checkpoint.id)
      }
      if (checkpoint.kind === "diagram" && !checkpoint.diagram_id) {
        errors.push(`${where}: diagram checkpoint without diagram_id`)
      }
      if (checkpoint.diagram_id && !diagramIds.has(checkpoint.diagram_id)) {
        errors.push(`${where}: unknown diagram ${checkpoint.diagram_id}`)
      }
      if (checkpoint.kind === "lesson" || checkpoint.kind === "concept_lab") {
        const words = checkpoint.body_markdown ? markdownWordCount(checkpoint.body_markdown) : 0
        if (words < LESSON_MIN_WORDS || words > LESSON_MAX_WORDS) {
          errors.push(`${where}: lesson body has ${words} words (want ${LESSON_MIN_WORDS}–${LESSON_MAX_WORDS})`)
        }
      }
      if (checkpoint.body_markdown?.includes("$$")) {
        errors.push(`${where}: body must not contain "$$" (migration quoting)`)
      }
    }
  }
  for (const diagram of CURRICULUM_DIAGRAMS) {
    for (const text of [diagram.body, diagram.a11y, diagram.title]) {
      if (text.includes("$$") || text.includes("\\")) {
        errors.push(`${diagram.id}: remove "$$" or backslashes (migration splitter)`)
      }
    }
  }
  return errors
}
