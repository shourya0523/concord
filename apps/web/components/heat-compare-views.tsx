"use client"

import * as React from "react"
import { ChartNoAxesColumn, Hexagon } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

import { HeatInsightsIsland } from "@/components/heat-insights-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"
import { TopicHeatSpiderIsland } from "@/components/topic-heat-spider-island"

type View = "heatmap" | "spider"

const TABS: Array<{ id: View; label: string; icon: typeof ChartNoAxesColumn }> =
  [
    { id: "heatmap", label: "Heat map", icon: ChartNoAxesColumn },
    { id: "spider", label: "Spider map", icon: Hexagon },
  ]

type Props = {
  firmIds?: string[]
  /** Full heat-compare page shows insights under the matrix. */
  showInsights?: boolean
  activateTarget?: "company" | "rag"
  compareMode?: boolean
  /** Avoid duplicate aria ids when multiple switchers could mount. */
  idPrefix?: string
  className?: string
}

/**
 * Heat / spider view switcher — matrix and spider share the same firm set;
 * only one viz is mounted at a time so the page isn't cut off.
 */
export function HeatCompareViews({
  firmIds,
  showInsights = true,
  activateTarget = "rag",
  compareMode = true,
  idPrefix = "heat",
  className,
}: Props) {
  const [view, setView] = React.useState<View>("heatmap")

  return (
    <div className={cn("space-y-6", className)}>
      <div
        role="tablist"
        aria-label="Heat compare view"
        className="flex flex-wrap gap-2"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = view === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`${idPrefix}-view-${tab.id}`}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              onClick={() => setView(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors",
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-border text-muted-foreground hover:border-ink/50 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${idPrefix}-panel-heatmap`}
        aria-labelledby={`${idPrefix}-view-heatmap`}
        hidden={view !== "heatmap"}
        className="space-y-8"
      >
        {view === "heatmap" ? (
          <>
            <TopicHeatIsland
              compareMode={compareMode}
              activateTarget={activateTarget}
              firmIds={firmIds}
            />
            {showInsights ? <HeatInsightsIsland firmIds={firmIds} /> : null}
          </>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id={`${idPrefix}-panel-spider`}
        aria-labelledby={`${idPrefix}-view-spider`}
        hidden={view !== "spider"}
      >
        {view === "spider" ? (
          <TopicHeatSpiderIsland firmIds={firmIds} />
        ) : null}
      </div>
    </div>
  )
}
