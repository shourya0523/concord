"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { Warren } from "@/components/mockups/warren"
import { readStoredTargets } from "@/components/target-select-island"

type PlanItem = {
  kind: "question" | "concept" | "resource" | "diagram" | "module" | "module_checkpoint"
  id: string
  due_at?: string | null
}

type StudyPlanResponse = {
  plan: {
    title: string
    learning_mode: "company_prep" | "concept_learn"
    firm_ids: string[]
    concept_ids: string[]
    weak_topic_ids: string[]
    items: PlanItem[]
  }
  source: string
  note?: string
}

type ModuleList = {
  items: Array<{
    id: string
    slug: string
    title: string
    concept_ids: string[]
    checkpoints: Array<{ id: string; kind: string; title: string }>
  }>
}

export function StudyPlanIsland() {
  const [plan, setPlan] = React.useState<StudyPlanResponse | null>(null)
  const [modules, setModules] = React.useState<ModuleList["items"]>([])
  const [status, setStatus] = React.useState("Loading your saved roadmap…")

  React.useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch("/api/study-plan", { signal: controller.signal }),
      fetch("/api/learn/modules", { signal: controller.signal }),
    ])
      .then(async ([planResponse, moduleResponse]) => {
        if (!planResponse.ok || !moduleResponse.ok) {
          throw new Error("Roadmap data is unavailable.")
        }
        return [
          (await planResponse.json()) as StudyPlanResponse,
          (await moduleResponse.json()) as ModuleList,
        ] as const
      })
      .then(([saved, available]) => {
        setPlan(saved)
        setModules(available.items)
        setStatus(saved.note ?? `Loaded from ${saved.source}.`)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setStatus(error instanceof Error ? error.message : "Roadmap unavailable.")
      })
    return () => controller.abort()
  }, [])

  async function buildRoadmap() {
    const targets = readStoredTargets()
    const selectedModules = modules.slice(0, 3)
    const items: PlanItem[] = selectedModules.flatMap((module, moduleIndex) => [
      {
        kind: "module",
        id: module.id,
        due_at: new Date(Date.now() + moduleIndex * 86_400_000).toISOString(),
      },
      ...(module.checkpoints[0]
        ? [
            {
              kind: "module_checkpoint" as const,
              id: module.checkpoints[0].id,
              due_at: new Date(Date.now() + (moduleIndex + 1) * 86_400_000).toISOString(),
            },
          ]
        : []),
    ])
    setStatus("Saving prerequisite-aware roadmap…")
    const response = await fetch("/api/study-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Interview study plan",
        learning_mode: "company_prep",
        firm_ids: targets,
        concept_ids: selectedModules.flatMap((module) => module.concept_ids),
        weak_topic_ids: [],
        items,
      }),
    })
    if (!response.ok) {
      setStatus(`Roadmap could not be saved (${response.status}).`)
      return
    }
    const saved = (await response.json()) as StudyPlanResponse
    setPlan(saved)
    setStatus(`Roadmap saved to ${saved.source}.`)
  }

  const moduleById = new Map(modules.map((module) => [module.id, module]))
  const checkpointById = new Map(
    modules.flatMap((module) =>
      module.checkpoints.map((checkpoint) => [
        checkpoint.id,
        { ...checkpoint, moduleSlug: module.slug },
      ] as const),
    ),
  )

  return (
    <div className="space-y-6">
      <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
        <p className="font-medium">Roadmap coach</p>
        <p className="mt-1 text-muted-foreground">
          Mix company drills with module and diagram checkpoints; keep prerequisites in order.
        </p>
      </NotionCallout>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={modules.length === 0} onClick={() => void buildRoadmap()}>
          Build from my targets
        </Button>
        <MetadataPill>{plan?.source ?? "loading"}</MetadataPill>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {status}
        </span>
      </div>

      <PaperSheet seedKey="study-plan-roadmap" torn={false}>
        <ol className="space-y-1">
          {(plan?.plan.items ?? []).map((item, index) => {
            const learningModule = moduleById.get(item.id)
            const checkpoint = checkpointById.get(item.id)
            const href = learningModule
              ? `/learn/${learningModule.slug}`
              : checkpoint
                ? `/learn/${checkpoint.moduleSlug}`
                : "/study"
            const label = learningModule?.title ?? checkpoint?.title ?? item.id
            return (
              <li key={`${item.kind}-${item.id}-${index}`} className="relative flex gap-3 py-3">
                {index < (plan?.plan.items.length ?? 0) - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-[-0.75rem] left-3.5 border-l border-dashed border-border"
                  />
                ) : null}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-black text-xs">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {item.kind}
                    {item.due_at ? ` · ${new Date(item.due_at).toLocaleDateString()}` : ""}
                  </p>
                  <Link href={href} className="text-sm font-medium hover:underline">
                    {label}
                  </Link>
                </div>
              </li>
            )
          })}
        </ol>
        {plan && plan.plan.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Build a roadmap to combine your real module catalog with your saved target firms.
          </p>
        ) : null}
      </PaperSheet>

      <Link href="/simulator">
        <Button variant="outline">Start firm mock checkpoint</Button>
      </Link>
    </div>
  )
}
