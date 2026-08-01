import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import {
  InkHoverScope,
  PaperSheet,
  RoughHover,
  WarrenCallout,
} from "@/components/paper"
import { HeatInsightsIsland } from "@/components/heat-insights-island"
import { TargetSelectIsland } from "@/components/target-select-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"

export const metadata = {
  title: "Topic heat compare · Concord",
  description: "Side-by-side firm × topic intensity for selected targets",
}

export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ firms?: string }>
}

export default async function HeatComparePage({ searchParams }: Props) {
  const { firms } = await searchParams
  const firmIds = (firms ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Mode A · multi-firm
          </p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Topic heat compare
          </h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">
            Intensity is occurrence-based firm signal — not teaching truth.
            Hatched cells mark your weak topics overlaid on heat; every cell
            keeps its numeric intensity and sample count visible.
          </p>
        </div>
        <Link href="/prep/rag">
          <RoughHover padding={5}>
            <Button>Open pseudo-RAG</Button>
          </RoughHover>
        </Link>
      </div>

      <WarrenCallout mood="thinking">
        Compare mode lines the same topics up across your target firms. Shared
        heat is where one drill covers several interviews; firm-unique heat is
        where a single firm over-indexes and deserves its own session. Add or
        remove firms and the matrix realigns.
      </WarrenCallout>

      <PaperSheet seedKey="heat-compare-targets" torn={false}>
        <div className="space-y-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Target company set
          </p>
          <TargetSelectIsland syncSearchParam className="max-w-full" />
        </div>
      </PaperSheet>
      <PaperSheet seedKey="heat-compare-matrix" torn={false}>
        <InkHoverScope selector="button:not(:disabled)">
          <TopicHeatIsland
            compareMode
            activateTarget="rag"
            firmIds={firmIds.length > 0 ? firmIds : undefined}
          />
        </InkHoverScope>
      </PaperSheet>
      <HeatInsightsIsland firmIds={firmIds.length > 0 ? firmIds : undefined} />
    </div>
  )
}
