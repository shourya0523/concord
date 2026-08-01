"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { cn } from "@ibpe/ui/lib/utils"

import { Annotate, CircledNumber, PaperSheet, RoughHover } from "@/components/paper"
import {
  fetchModuleProgress,
  moduleProgressPercent,
  type ModuleProgressEntry,
} from "@/components/progress-client"

export type RoadmapCheckpoint = {
  id: string
  kind: "lesson" | "concept_lab" | "drill" | "quiz" | "diagram"
  title: string
  /** Resolved server-side: concept labs → /concepts/[slug], drills/quiz → /study. */
  href: string | null
}

const KIND_LABELS: Record<RoadmapCheckpoint["kind"], string> = {
  lesson: "lesson",
  concept_lab: "concept lab",
  drill: "drill",
  quiz: "quiz",
  diagram: "diagram",
}

type CheckpointState = "done" | "current" | "locked" | "open"

/** Hero mastery chip — quiet mono pill, calm number, never animated. */
export function ModuleMasteryChip({ moduleId }: { moduleId: string }) {
  const [percent, setPercent] = React.useState<number | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void fetchModuleProgress().then((entries) => {
      if (!cancelled) setPercent(moduleProgressPercent(entries, moduleId))
    })
    return () => {
      cancelled = true
    }
  }, [moduleId])

  return (
    <>
      {percent === 100 ? (
        <CircledNumber value="100%" label="mastery" size="sm" className="origin-left scale-75" />
      ) : (
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Mastery {percent === null ? "—" : `${percent}%`}
        </span>
      )}
    </>
  )
}

/**
 * Module roadmap — ordered checkpoint path (DESIGN.md §10.6.2).
 * done = strike-through, current = ink circle, locked = dashed + not clickable.
 * Before progress loads, every checkpoint renders open (no transient locks).
 */
export function ModuleRoadmapIsland({
  moduleId,
  checkpoints,
  sessionHref,
}: {
  moduleId: string
  checkpoints: RoadmapCheckpoint[]
  sessionHref: string
}) {
  const [progress, setProgress] = React.useState<ModuleProgressEntry[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void fetchModuleProgress().then((entries) => {
      if (!cancelled) setProgress(entries)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const entry = progress?.find((candidate) => candidate.module_id === moduleId)
  const doneIds = new Set(entry?.completed_checkpoint_ids ?? [])
  const firstIncomplete = checkpoints.findIndex((checkpoint) => !doneIds.has(checkpoint.id))
  const currentIndex = firstIncomplete === -1 ? checkpoints.length : firstIncomplete
  const percent = progress === null ? null : moduleProgressPercent(progress, moduleId)

  function stateFor(index: number, id: string): CheckpointState {
    if (progress === null) return "open"
    if (doneIds.has(id) || index < currentIndex) return "done"
    if (index === currentIndex) return "current"
    return "locked"
  }

  const continueCheckpoint =
    progress !== null && currentIndex < checkpoints.length
      ? checkpoints[currentIndex]
      : checkpoints[0]

  return (
    <div className="space-y-4">
      <PaperSheet seedKey={`roadmap-${moduleId}`} torn={false}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Module roadmap
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground">
            {percent === null
              ? "Mastery —"
              : `Mastery ${percent}% · ${Math.min(doneIds.size, checkpoints.length)}/${checkpoints.length} checkpoints`}
          </span>
        </div>
        <ol className="mt-5">
          {checkpoints.map((checkpoint, index) => {
            const state = stateFor(index, checkpoint.id)
            const locked = state === "locked"
            const clickable = !locked && checkpoint.href !== null
            const body = (
              <>
                {state === "current" ? (
                  <Annotate type="circle" color="var(--ink)" padding={3}>
                    <span className="flex size-7 items-center justify-center rounded-full border border-ink bg-ink text-xs text-paper">
                      {index + 1}
                    </span>
                  </Annotate>
                ) : (
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border text-xs",
                      locked
                        ? "border-dashed border-border text-muted-foreground"
                        : state === "done"
                          ? "border-ink/40 text-muted-foreground"
                          : "border-border",
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0 pt-0.5">
                  <span className="block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {KIND_LABELS[checkpoint.kind]}
                  </span>
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      locked && "text-muted-foreground",
                    )}
                  >
                    {state === "done" ? (
                      <Annotate type="strike-through" color="var(--graphite)" padding={2}>
                        {checkpoint.title}
                      </Annotate>
                    ) : clickable || state === "open" || state === "current" ? (
                      <RoughHover>{checkpoint.title}</RoughHover>
                    ) : (
                      checkpoint.title
                    )}
                  </span>
                </span>
              </>
            )
            return (
              <li
                key={checkpoint.id}
                className="relative py-3"
                aria-disabled={locked || undefined}
              >
                {index < checkpoints.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-[-0.75rem] left-3.5 border-l border-dashed border-border"
                  />
                ) : null}
                {clickable ? (
                  <Link className="flex gap-3" href={checkpoint.href!}>
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3">{body}</div>
                )}
              </li>
            )
          })}
        </ol>
      </PaperSheet>

      <div className="flex flex-wrap gap-2">
        <Link href={sessionHref}>
          <Button>Start module session</Button>
        </Link>
        {continueCheckpoint?.href ? (
          <Link href={continueCheckpoint.href}>
            <Button variant="outline">
              {progress !== null && currentIndex === checkpoints.length
                ? "Review from the top"
                : `Continue · ${continueCheckpoint.title}`}
            </Button>
          </Link>
        ) : null}
        <Link href="/prep/rag">
          <Button variant="ghost">Apply at a firm</Button>
        </Link>
      </div>
    </div>
  )
}
