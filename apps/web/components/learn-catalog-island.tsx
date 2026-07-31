"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { cn } from "@ibpe/ui/lib/utils"

import { Annotate, PaperSheet, WarrenCallout } from "@/components/paper"
import {
  fetchModuleProgress,
  moduleProgressPercent,
  type ModuleProgressEntry,
} from "@/components/progress-client"

export type CatalogModule = {
  id: string
  slug: string
  title: string
  summary: string
  domain: string
  track: string | null
  estimatedMinutes: number
  checkpointCount: number
  prereqModuleIds: string[]
}

type TrackGroup = "IB" | "PE" | "Behavioural"

const CHIPS: Array<TrackGroup | "All"> = ["All", "IB", "PE", "Behavioural"]

/** Behavioural read from track/domain/title — corpus has no behavioural track enum yet. */
function groupForModule(module: CatalogModule): TrackGroup {
  const haystack = `${module.track ?? ""} ${module.domain} ${module.title}`.toLowerCase()
  if (haystack.includes("behaviour") || haystack.includes("behavior")) return "Behavioural"
  if ((module.track ?? "").toUpperCase() === "PE" || module.domain.toLowerCase() === "pe") {
    return "PE"
  }
  return "IB"
}

type Recommendation = {
  module: CatalogModule
  why: string
}

/**
 * Module catalog — track chips, progress-aware cards, explainable
 * "recommended next" (prereqs ≥ 80% or none, first incomplete module).
 */
export function LearnCatalogIsland({ modules }: { modules: CatalogModule[] }) {
  const [filter, setFilter] = React.useState<(typeof CHIPS)[number]>("All")
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

  const recommendation = React.useMemo<Recommendation | null>(() => {
    if (!progress) return null
    const fraction = (id: string) =>
      progress.find((entry) => entry.module_id === id)?.percent ?? 0
    const candidate = modules.find(
      (module) =>
        fraction(module.id) < 1 &&
        module.prereqModuleIds.every((prereqId) => fraction(prereqId) >= 0.8),
    )
    if (!candidate) return null
    const dependent = modules.find((module) =>
      module.prereqModuleIds.includes(candidate.id),
    )
    const why = [
      candidate.prereqModuleIds.length === 0 ? "No blocking prereqs" : "Prereqs ready",
      dependent ? `builds toward ${dependent.title}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    return { module: candidate, why }
  }, [modules, progress])

  const visible =
    filter === "All" ? modules : modules.filter((module) => groupForModule(module) === filter)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Track filter">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            aria-pressed={filter === chip}
            onClick={() => setFilter(chip)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors",
              filter === chip
                ? "border-ink bg-ink text-paper"
                : "border-border text-muted-foreground hover:border-ink/50 hover:text-foreground",
            )}
          >
            {chip}
          </button>
        ))}
      </div>

      {recommendation ? (
        <WarrenCallout mood="encouraging" bracket size={48}>
          Recommended next:{" "}
          <Link
            className="font-medium underline underline-offset-4"
            href={`/learn/${recommendation.module.slug}`}
          >
            {recommendation.module.title}
          </Link>
          <span className="mt-0.5 block text-muted-foreground">{recommendation.why}</span>
        </WarrenCallout>
      ) : null}

      {visible.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          No modules on this track yet — check back after the next curriculum import.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((module) => {
            const percent = progress === null ? null : moduleProgressPercent(progress, module.id)
            return (
              <li key={module.id}>
                <PaperSheet seedKey={`module-${module.id}`} torn={false} className="h-full">
                  <div className="flex h-full flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <MetadataPill>{module.domain.toUpperCase()}</MetadataPill>
                      <MetadataPill>{module.estimatedMinutes} min</MetadataPill>
                      <MetadataPill>
                        {module.checkpointCount}{" "}
                        {module.checkpointCount === 1 ? "checkpoint" : "checkpoints"}
                      </MetadataPill>
                    </div>
                    <h2 className="mt-4 font-display text-2xl leading-tight tracking-tight">
                      {module.title}
                    </h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {module.summary}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                        Progress{" "}
                        {percent === null ? (
                          "—"
                        ) : percent >= 100 ? (
                          <Annotate type="circle" color="var(--ink)" padding={3}>
                            <span className="text-foreground">100%</span>
                          </Annotate>
                        ) : (
                          <span className="text-foreground">{percent}%</span>
                        )}
                      </span>
                      <Link href={`/learn/${module.slug}`}>
                        <Button size="sm">Open roadmap</Button>
                      </Link>
                    </div>
                  </div>
                </PaperSheet>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
