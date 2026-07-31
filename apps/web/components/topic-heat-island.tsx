"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { TopicHeatmap, type TopicHeatCell } from "@ibpe/ui/components/topic-heatmap"

import { readStoredTargets } from "@/components/target-select-island"
import {
  FIRMS,
  TOPICS,
  heatFirms,
  intensityToHeatLevel,
  WEAK_TOPICS,
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
  const [cells, setCells] = React.useState<TopicHeatCell[]>([])
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle")

  React.useEffect(() => {
    if (firmIds?.length) {
      setIds(firmIds)
      return
    }
    setIds(readStoredTargets())
  }, [firmIds])

  const firms = heatFirms(ids)

  React.useEffect(() => {
    if (ids.length === 0) {
      setCells([])
      setStatus("idle")
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams()
    ids.forEach((id) => params.append("firm_id", id))
    setStatus("loading")
    fetch(`/api/prep/heat?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Heat request failed (${response.status})`)
        return (await response.json()) as {
          topics: Array<{
            firm_id: string
            topic_id: string
            intensity: number
            sample_size: number
          }>
        }
      })
      .then((payload) => {
        const weak = new Set(WEAK_TOPICS.map((topic) => topic.id))
        const firmMap = new Map(FIRMS.map((firm) => [firm.id, firm]))
        const topicMap = new Map(TOPICS.map((topic) => [topic.id, topic.label]))
        setCells(
          payload.topics.map((row) => ({
            firmId: row.firm_id,
            firmLabel:
              firmMap.get(row.firm_id)?.aliases[0] ??
              firmMap.get(row.firm_id)?.name ??
              row.firm_id,
            topicId: row.topic_id,
            topicLabel: topicMap.get(row.topic_id) ?? row.topic_id.replace(/^topic_/, ""),
            intensity: intensityToHeatLevel(row.intensity),
            weak: weak.has(row.topic_id),
            count: row.sample_size,
          })),
        )
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.warn("[heat] Could not load occurrence signals", error)
        setCells([])
        setStatus("error")
      })
    return () => controller.abort()
  }, [ids.join(",")])

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

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading firm occurrence signals…</p>
  }

  if (status === "error" || (status === "ready" && cells.length === 0)) {
    return (
      <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        No topic signals are published for this firm set yet. Choose another firm or return later.
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
