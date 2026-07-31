"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import {
  EditorialHeading,
  MetadataPill,
} from "@ibpe/ui/components/editorial"

import { TargetSelectIsland, fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"

export function DashboardIsland() {
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<Map<string, { name: string; slug: string }>>(new Map())
  const [mode, setMode] = React.useState<"company_prep" | "concept_learn">("company_prep")
  const [mastery, setMastery] = React.useState<Array<{ score: number; subject_id: string }>>([])
  const [planItems, setPlanItems] = React.useState(0)
  const [modules, setModules] = React.useState<Array<{ slug: string; title: string }>>([])

  React.useEffect(() => {
    setTargets(readStoredTargets())
    void fetchFirmOptions().then((options) => {
      setFirmNames(
        new Map(options.map((firm) => [firm.id, { name: firm.name, slug: firm.id.replace(/^firm_/, "") }])),
      )
    })
    const controller = new AbortController()
    Promise.all([
      fetch("/api/mastery", { signal: controller.signal }),
      fetch("/api/study-plan", { signal: controller.signal }),
      fetch("/api/learn/modules", { signal: controller.signal }),
    ])
      .then(async ([masteryResponse, planResponse, moduleResponse]) => {
        const masteryPayload = masteryResponse.ok
          ? ((await masteryResponse.json()) as { items?: Array<{ score: number; subject_id: string }> })
          : {}
        const planPayload = planResponse.ok
          ? ((await planResponse.json()) as { plan?: { items?: unknown[] } })
          : {}
        const modulePayload = moduleResponse.ok
          ? ((await moduleResponse.json()) as {
              items?: Array<{ slug: string; title: string }>
            })
          : {}
        setMastery(masteryPayload.items ?? [])
        setPlanItems(planPayload.plan?.items?.length ?? 0)
        setModules(modulePayload.items ?? [])
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[dashboard] Summary data unavailable", error)
        }
      })
    return () => controller.abort()
  }, [])

  const primary = targets[0] ? firmNames.get(targets[0]) : undefined
  const weakCount = mastery.filter((item) => item.score < 0.68).length
  const averageMastery = mastery.length
    ? Math.round((mastery.reduce((sum, item) => sum + item.score, 0) / mastery.length) * 100)
    : null

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <EditorialHeading eyebrow="Home · what to learn next" as="h1">
          {mode === "company_prep" ? "Company prep desk" : "Concept lab desk"}
        </EditorialHeading>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Active mode">
          <Button
            type="button"
            size="sm"
            variant={mode === "company_prep" ? "default" : "outline"}
            onClick={() => setMode("company_prep")}
          >
            Company prep
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "concept_learn" ? "default" : "outline"}
            onClick={() => setMode("concept_learn")}
          >
            Concept lab
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Target companies
            </h2>
            <MetadataPill tone="lime">{targets.length} selected</MetadataPill>
          </div>
          <TargetSelectIsland value={targets} onChange={setTargets} syncSearchParam />
          <TopicHeatIsland firmIds={targets} />
          <Link
            href="/prep/heat"
            className="inline-block text-sm text-foreground underline-offset-4 hover:underline"
          >
            Open full heat compare →
          </Link>
        </section>

        <aside className="space-y-8 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Mastery</p>
              <p className="mt-1 text-2xl font-semibold">
                {averageMastery === null ? "—" : `${averageMastery}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weak records</p>
              <p className="mt-1 text-2xl font-semibold">{weakCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plan items</p>
              <p className="mt-1 text-2xl font-semibold">{planItems}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Modules</p>
              <p className="mt-1 text-2xl font-semibold">{modules.length}</p>
            </div>
          </div>
          <WeakTopicFocusBar />
          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Suggested next
            </p>
            <p className="font-display text-2xl leading-snug tracking-tight">
              {mode === "company_prep"
                ? `Grounded pack for ${primary?.name ?? "your targets"}`
                : modules[0]?.title ?? "Choose a learning module"}
            </p>
            <p className="text-sm text-muted-foreground">
              {mastery.length
                ? `${weakCount} mastery records are below proficient and feed the next session.`
                : "Complete a real practice attempt to generate a personal weakness signal."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/prep/rag">
                <Button>Start pseudo-RAG</Button>
              </Link>
              <Link href="/study">
                <Button variant="outline">Weak-topic drill</Button>
              </Link>
              {mode === "concept_learn" ? (
                <Link href={modules[0] ? `/learn/${modules[0].slug}` : "/learn"}>
                  <Button variant="ghost">Open Learn</Button>
                </Link>
              ) : primary ? (
                <Link href={`/companies/${primary.slug}`}>
                  <Button variant="ghost">Company room</Button>
                </Link>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
