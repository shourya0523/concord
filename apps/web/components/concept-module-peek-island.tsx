"use client"

import * as React from "react"
import Link from "next/link"

import {
  fetchModuleProgress,
  moduleProgressPercent,
  type ModuleProgressEntry,
} from "@/components/progress-client"

export type PeekCheckpoint = {
  id: string
  title: string
  kind: string
}

/**
 * Parent-module progress peek — calm percent + next incomplete checkpoint.
 * Links back into the module hub roadmap.
 */
export function ConceptModulePeekIsland({
  moduleId,
  moduleSlug,
  moduleTitle,
  checkpoints,
}: {
  moduleId: string
  moduleSlug: string
  moduleTitle: string
  checkpoints: PeekCheckpoint[]
}) {
  const [entry, setEntry] = React.useState<ModuleProgressEntry[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void fetchModuleProgress().then((entries) => {
      if (!cancelled) setEntry(entries)
    })
    return () => {
      cancelled = true
    }
  }, [moduleId])

  const percent = entry === null ? null : moduleProgressPercent(entry, moduleId)
  const doneIds = new Set(
    entry?.find((candidate) => candidate.module_id === moduleId)?.completed_checkpoint_ids ??
      [],
  )
  const next = checkpoints.find((checkpoint) => !doneIds.has(checkpoint.id))

  return (
    <div className="rounded-sm border border-border px-4 py-3 text-sm">
      <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        Parent module
      </p>
      <p className="mt-1">
        <Link className="font-medium underline underline-offset-4" href={`/learn/${moduleSlug}`}>
          {moduleTitle}
        </Link>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
          {percent === null ? "progress —" : `${percent}% complete`}
        </span>
      </p>
      {percent !== null ? (
        next ? (
          <p className="mt-1 text-muted-foreground">
            Next checkpoint ·{" "}
            <Link className="underline underline-offset-4" href={`/learn/${moduleSlug}`}>
              {next.title}
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">All checkpoints complete.</p>
        )
      ) : null}
    </div>
  )
}
