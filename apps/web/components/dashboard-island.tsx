"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import {
  EditorialHeading,
  MetricDisplay,
  MetadataPill,
} from "@ibpe/ui/components/editorial"

import { TargetSelectIsland, readStoredTargets } from "@/components/target-select-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { FIRMS } from "@/lib/mock-data"

export function DashboardIsland() {
  const [targets, setTargets] = React.useState<string[]>([])
  const [mode, setMode] = React.useState<"company_prep" | "concept_learn">("company_prep")

  React.useEffect(() => {
    setTargets(readStoredTargets())
  }, [])

  const readiness = targets.length ? Math.min(92, 48 + targets.length * 8) : 0
  const primary = FIRMS.find((f) => f.id === targets[0])

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
          <div className="grid grid-cols-2 gap-6">
            <MetricDisplay label="Readiness" value={`${readiness}%`} hint={primary?.name ?? "Select firms"} />
            <MetricDisplay label="Weak topics" value="3" hint="Auto-focus queue" />
            <MetricDisplay label="Days out" value="18" hint="Interview urgency" />
            <MetricDisplay label="Streak" value="4" hint="Sessions" />
          </div>
          <WeakTopicFocusBar />
          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Suggested next
            </p>
            <p className="font-display text-2xl leading-snug tracking-tight">
              Pseudo-RAG pack for {primary?.name ?? "your targets"} × DCF weakness
            </p>
            <p className="text-sm text-muted-foreground">
              Heat ∩ weakness overlay prefers DCF at IB targets and LBO at PE targets.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/prep/rag">
                <Button>Start pseudo-RAG</Button>
              </Link>
              <Link href="/study">
                <Button variant="outline">Weak-topic drill</Button>
              </Link>
              {mode === "concept_learn" ? (
                <Link href="/concepts/dcf-valuation">
                  <Button variant="ghost">Open DCF lab</Button>
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
