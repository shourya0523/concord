"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { TopicHeatmap, type TopicHeatCell } from "@ibpe/ui/components/topic-heatmap"

import { readStoredTargets } from "@/components/target-select-island"
import {
  FIRMS,
  TOPICS,
  buildHeatCells,
  heatFirms,
} from "@/lib/mock-data"

type Props = {
  firmIds?: string[]
  compareMode?: boolean
  className?: string
}

function slugForFirmId(firmId: string): string {
  return FIRMS.find((f) => f.id === firmId)?.slug ?? "goldman-sachs"
}

export function TopicHeatIsland({ firmIds, compareMode = true, className }: Props) {
  const router = useRouter()
  const [ids, setIds] = React.useState<string[]>(firmIds ?? [])

  React.useEffect(() => {
    if (firmIds?.length) {
      setIds(firmIds)
      return
    }
    setIds(readStoredTargets())
  }, [firmIds])

  const firms = heatFirms(ids)
  const cells = buildHeatCells(ids)

  function onCellActivate(cell: TopicHeatCell) {
    router.push(`/companies/${slugForFirmId(cell.firmId)}?focus=${cell.topicId}`)
  }

  if (ids.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select at least one target firm to render topic heat.
      </p>
    )
  }

  return (
    <TopicHeatmap
      firms={firms}
      topics={[...TOPICS]}
      cells={cells}
      compareMode={compareMode}
      onCellActivate={onCellActivate}
      className={className}
    />
  )
}
