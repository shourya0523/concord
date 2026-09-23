"use client"

import * as React from "react"

import { DiagramIsland } from "@/components/diagram-island"
import { publishModuleProgress, type ModuleProgressEntry } from "@/components/progress-client"

/**
 * Graded diagram checkpoint (P7.2): an interactive fill-in diagram that marks
 * its module checkpoint complete once every blank is correct. Progress saving
 * needs a signed-in user; anonymous learners still get full feedback.
 */
export function ModuleDiagramQuizIsland({
  moduleSlug,
  checkpointId,
  title,
  source,
  a11yFallback,
}: {
  moduleSlug: string
  checkpointId: string
  title: string
  source: string
  a11yFallback: string
}) {
  const [saveNote, setSaveNote] = React.useState<string | null>(null)
  const savedRef = React.useRef(false)

  async function markComplete() {
    if (savedRef.current) return
    savedRef.current = true
    try {
      const response = await fetch(
        `/api/learn/modules/${encodeURIComponent(moduleSlug)}/progress`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkpoint_id: checkpointId, complete: true }),
        },
      )
      if (!response.ok) {
        savedRef.current = false
        setSaveNote(
          response.status === 401
            ? "Quiz passed — sign in to save it to your module progress."
            : "Quiz passed, but progress could not be saved right now.",
        )
        return
      }
      const payload = (await response.json()) as { module_progress: ModuleProgressEntry }
      void publishModuleProgress(payload.module_progress)
      setSaveNote("Quiz passed — checkpoint marked complete.")
    } catch {
      savedRef.current = false
      setSaveNote("Quiz passed, but progress could not be saved right now.")
    }
  }

  return (
    <div className="space-y-2">
      <DiagramIsland
        title={title}
        source={source}
        a11yFallback={a11yFallback}
        format="interactive-json"
        onCheck={(result) => {
          if (result.total > 0 && result.correct === result.total) void markComplete()
        }}
      />
      {saveNote ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {saveNote}
        </p>
      ) : null}
    </div>
  )
}
