"use client"

import * as React from "react"
import Link from "next/link"

import { Annotate, RoughHover, SemanticPill } from "@/components/paper"
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
    entry?.find((candidate) => candidate.module_id === moduleId)
      ?.completed_checkpoint_ids ?? []
  )
  const next = checkpoints.find((checkpoint) => !doneIds.has(checkpoint.id))
  const path = checkpoints.slice(0, 5)

  return (
    <div className="rounded-sm border border-border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          Parent module mini-path
        </p>
        <SemanticPill tone="milestone" icon={false}>
          {percent === null ? "progress —" : `${percent}% complete`}
        </SemanticPill>
      </div>
      <p className="mt-2">
        <Link
          className="font-medium underline underline-offset-4"
          href={`/learn/${moduleSlug}`}
        >
          {moduleTitle}
        </Link>
      </p>
      {path.length > 0 ? (
        <ol
          className="mt-3 space-y-2"
          aria-label={`${moduleTitle} checkpoint path`}
        >
          {path.map((checkpoint, index) => {
            const done = doneIds.has(checkpoint.id)
            const current = next?.id === checkpoint.id
            return (
              <li key={checkpoint.id} className="relative flex gap-2 py-1">
                {index < path.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-7 bottom-[-0.55rem] left-[0.65rem] border-l border-dashed border-border"
                  />
                ) : null}
                {current ? (
                  <Annotate type="circle" color="var(--ink)" padding={2}>
                    <span className="flex size-6 items-center justify-center rounded-full border border-ink bg-ink text-[10px] text-paper">
                      {index + 1}
                    </span>
                  </Annotate>
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0 pt-0.5">
                  <span className="block font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                    {done
                      ? "done"
                      : current
                        ? "next"
                        : checkpoint.kind.replace(/_/g, " ")}
                  </span>
                  <Link
                    className="block truncate text-xs font-medium underline-offset-4 hover:underline"
                    href={`/learn/${moduleSlug}`}
                  >
                    {done ? (
                      <Annotate
                        type="crossed-off"
                        color="var(--graphite)"
                        padding={1}
                      >
                        {checkpoint.title}
                      </Annotate>
                    ) : (
                      <RoughHover>{checkpoint.title}</RoughHover>
                    )}
                  </Link>
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
      {checkpoints.length > path.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          +{checkpoints.length - path.length} later checkpoint
          {checkpoints.length - path.length === 1 ? "" : "s"} in the module.
        </p>
      ) : null}
      {percent !== null ? (
        next ? (
          <p className="mt-1 text-muted-foreground">
            Next checkpoint ·{" "}
            <Link
              className="underline underline-offset-4"
              href={`/learn/${moduleSlug}`}
            >
              {next.title}
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">
            All checkpoints complete.
          </p>
        )
      ) : null}
    </div>
  )
}
