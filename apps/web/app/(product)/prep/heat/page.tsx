import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { TargetSelectIsland } from "@/components/target-select-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"

export const metadata = {
  title: "Topic heat compare · IBPE",
  description: "Side-by-side firm × topic intensity for selected targets",
}

export default function HeatComparePage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <EditorialHeading eyebrow="Mode A · multi-firm" as="h1">
          Topic heat compare
        </EditorialHeading>
        <Link href="/prep/rag">
          <Button>Open pseudo-RAG</Button>
        </Link>
      </div>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Intensity is occurrence-based firm signal — not teaching truth. Hatched cells mark
        your weak topics overlaid on heat.
      </p>
      <TargetSelectIsland syncSearchParam />
      <TopicHeatIsland compareMode />
    </div>
  )
}
