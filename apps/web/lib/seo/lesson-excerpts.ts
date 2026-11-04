/**
 * Answer-first excerpts of Concord's own lessons for the public guide
 * (SEO/GEO plan step 4). Each lesson contributes its opening section (the
 * core idea) and its interview-answer section, if it has one. The full
 * lesson, diagrams and quizzes stay in the app.
 *
 * Source: lib/data/curriculum (the curriculum's source of truth).
 */
import { CURRICULUM_MODULES } from "@/lib/data/curriculum"

export type LessonSection = { heading: string; body: string }

export type LessonExcerpt = {
  checkpointId: string
  title: string
  lead: LessonSection
  answer: LessonSection | null
}

/** Lesson sections that hold the spoken interview answer. */
const ANSWER_HEADING = /\b(interview answer|one-line answer)\b/i

/** Split lesson markdown on "## " headings. Text before the first heading is dropped. */
export function splitSections(markdown: string): LessonSection[] {
  const sections: LessonSection[] = []
  for (const chunk of markdown.split(/^## /m).slice(1)) {
    const newline = chunk.indexOf("\n")
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
    const body = newline === -1 ? "" : chunk.slice(newline + 1).trim()
    if (heading && body) sections.push({ heading, body })
  }
  return sections
}

export function excerptLesson(markdown: string): { lead: LessonSection; answer: LessonSection | null } | null {
  const sections = splitSections(markdown)
  const lead = sections[0]
  if (!lead) return null
  const answer = sections.slice(1).find((section) => ANSWER_HEADING.test(section.heading)) ?? null
  return { lead, answer }
}

/** Excerpts for every lesson checkpoint tagged with this concept, in module order. */
export function lessonExcerptsForConcept(conceptId: string): LessonExcerpt[] {
  const excerpts: LessonExcerpt[] = []
  const modules = [...CURRICULUM_MODULES].sort((a, b) => a.order - b.order)
  for (const learningModule of modules) {
    const checkpoints = [...learningModule.checkpoints].sort((a, b) => a.position - b.position)
    for (const checkpoint of checkpoints) {
      if (checkpoint.kind !== "lesson" || checkpoint.concept_id !== conceptId || !checkpoint.body_markdown) continue
      const excerpt = excerptLesson(checkpoint.body_markdown)
      if (excerpt) excerpts.push({ checkpointId: checkpoint.id, title: checkpoint.title, ...excerpt })
    }
  }
  return excerpts
}
