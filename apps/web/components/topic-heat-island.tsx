"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { TopicHeatmap, type TopicHeatCell } from "@ibpe/ui/components/topic-heatmap"

import { InkHoverScope, RoughHeatBorders } from "@/components/paper"
import { readStoredTargets } from "@/components/target-select-island"
import { sortTopicSlugs, topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery } from "@/lib/weak-topics"
import { intensityBand } from "@/components/paper/heat-strip"

type Props = {
  firmIds?: string[]
  compareMode?: boolean
  activateTarget?: "company" | "rag"
  className?: string
  onCellsLoaded?: (cells: TopicHeatCell[]) => void
}

type HeatPayload = {
  firms: Array<{ id: string; slug: string; name: string }>
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
  source?: string
  note?: string
}

function toHeatLevel(intensity: number): 0 | 1 | 2 | 3 | 4 {
  return intensityBand(intensity)
}

/**
 * Firm×topic matrix fed entirely by /api/prep/heat (tagged occurrences) and
 * /api/mastery (weak overlay). No static firm/topic catalogs.
 */
export function TopicHeatIsland({
  firmIds,
  compareMode = true,
  activateTarget = "company",
  className,
  onCellsLoaded,
}: Props) {
  const router = useRouter()
  const [ids, setIds] = React.useState<string[]>(firmIds ?? [])
  const [cells, setCells] = React.useState<TopicHeatCell[]>([])
  const [firms, setFirms] = React.useState<Array<{ id: string; label: string }>>([])
  const [topics, setTopics] = React.useState<Array<{ id: string; label: string }>>([])
  const [status, setStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle")
  const [showWeakOverlay, setShowWeakOverlay] = React.useState(true)

  React.useEffect(() => {
    if (firmIds?.length) {
      setIds(firmIds)
      return
    }
    setIds(readStoredTargets())
  }, [firmIds])

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

    Promise.all([
      fetch(`/api/prep/heat?${params.toString()}`, { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error(`Heat request failed (${response.status})`)
          return (await response.json()) as HeatPayload
        },
      ),
      fetch("/api/mastery", { signal: controller.signal })
        .then(async (response) =>
          response.ok
            ? ((await response.json()) as {
                items?: Array<{ score: number; subject_id: string; subject_type: string }>
              })
            : { items: [] },
        )
        .catch(() => ({ items: [] }) as {
          items?: Array<{ score: number; subject_id: string; subject_type: string }>
        }),
    ])
      .then(([payload, masteryPayload]) => {
        const weak = new Set(
          weakTopicsFromMastery(
            (masteryPayload.items ?? []).map((item) => ({
              subject_type: item.subject_type as "concept",
              subject_id: item.subject_id,
              score: item.score,
            })),
          ).map((entry) => entry.topic),
        )
        const slugByFirm = new Map(payload.firms.map((firm) => [firm.id, firm]))
        const visibleTopics = sortTopicSlugs(
          payload.topics.map((row) => row.topic_id),
        ).filter((topic) => topic !== "untagged")
        const nextCells = payload.topics
          .filter((row) => row.topic_id !== "untagged")
          .map((row) => ({
            firmId: row.firm_id,
            firmSlug: slugByFirm.get(row.firm_id)?.slug,
            firmLabel: slugByFirm.get(row.firm_id)?.name ?? row.firm_id,
            topicId: row.topic_id,
            topicLabel: topicLabel(row.topic_id),
            intensity: toHeatLevel(row.intensity),
            weak: weak.has(row.topic_id),
            count: row.sample_size,
          }))
        setFirms(payload.firms.map((firm) => ({ id: firm.id, label: firm.name })))
        setTopics(visibleTopics.map((topic) => ({ id: topic, label: topicLabel(topic) })))
        setCells(nextCells)
        onCellsLoaded?.(nextCells)
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

  const displayCells = React.useMemo(
    () =>
      showWeakOverlay
        ? cells
        : cells.map((cell) => ({
            ...cell,
            weak: false,
          })),
    [cells, showWeakOverlay],
  )
  const hasWeakCells = cells.some((cell) => cell.weak)

  function onCellActivate(cell: TopicHeatCell) {
    if (activateTarget === "rag") {
      const params = new URLSearchParams({
        firm: cell.firmId,
        topic: cell.topicId,
      })
      router.push(`/prep/rag?${params.toString()}`)
      return
    }
    const firmKey = cell.firmSlug ?? cell.firmId.replace(/^firm_/, "")
    router.push(`/companies/${firmKey}?focus=${cell.topicId}`)
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
        No tagged topic signals are published for this firm set yet. Occurrence volume still
        counts toward firm readiness — choose another firm or check back after the next import.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80 uppercase">
          Cell click opens{" "}
          {activateTarget === "rag" ? "a scoped pseudo-RAG pack" : "the company topic focus"}.
          Heat level and n are printed in every cell; hatch marks weak topics.
        </p>
        <button
          type="button"
          aria-pressed={showWeakOverlay}
          disabled={!hasWeakCells}
          onClick={() => setShowWeakOverlay((current) => !current)}
          className="rounded-full border border-border px-3 py-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase transition-colors duration-200 ease-out hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          Weakness overlay {showWeakOverlay ? "on" : "off"}
        </button>
      </div>
      {!hasWeakCells ? (
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground/70 uppercase">
          No weak-topic hatch is available from mastery yet.
        </p>
      ) : null}
      <InkHoverScope selector="button:not(:disabled)">
        <RoughHeatBorders
          seedKey={`heat-${ids.join("-")}-${displayCells.length}`}
          deps={displayCells}
        >
          <TopicHeatmap
            key={`heat-${ids.join("-")}`}
            firms={firms}
            topics={topics}
            cells={displayCells}
            compareMode={compareMode}
            onCellActivate={onCellActivate}
            className={className}
          />
        </RoughHeatBorders>
      </InkHoverScope>
    </div>
  )
}
