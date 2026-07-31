"use client"

import * as React from "react"

import { HeatStrip, type HeatStripEntry } from "@/components/paper"
import { readStoredTargets } from "@/components/target-select-island"

type HeatPayload = {
  firms: Array<{ id: string; name: string }>
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

/**
 * "Where firms ask this" — module topics × the user's stored target firms.
 * Hidden when no targets are selected (never a silent all-firms default).
 */
export function ModuleHeatIsland({ topics }: { topics: string[] }) {
  const topicsKey = topics.join(",")
  const [entries, setEntries] = React.useState<HeatStripEntry[]>([])
  const [firmCount, setFirmCount] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  // Lazy init reads stored targets once on mount — settles immediately when
  // there is nothing to fetch, so the effect only ever sets state async.
  const [settled, setSettled] = React.useState(
    () => readStoredTargets().length === 0 || topicsKey.length === 0,
  )

  React.useEffect(() => {
    const wanted = new Set(topicsKey.split(",").filter(Boolean))
    const targets = readStoredTargets()
    if (targets.length === 0 || wanted.size === 0) return
    const controller = new AbortController()
    const params = new URLSearchParams()
    targets.forEach((id) => params.append("firm_id", id))
    fetch(`/api/prep/heat?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Heat request failed (${response.status})`)
        return (await response.json()) as HeatPayload
      })
      .then((payload) => {
        const rows = payload.topics.filter((row) => wanted.has(row.topic_id))
        const byTopic = new Map<string, HeatStripEntry>()
        for (const row of rows) {
          const existing = byTopic.get(row.topic_id)
          byTopic.set(row.topic_id, {
            topic: row.topic_id,
            intensity: Math.max(existing?.intensity ?? 0, row.intensity),
            sampleSize: (existing?.sampleSize ?? 0) + row.sample_size,
          })
        }
        setEntries([...byTopic.values()].sort((a, b) => b.intensity - a.intensity))
        setTotal(rows.reduce((sum, row) => sum + row.sample_size, 0))
        setFirmCount(payload.firms.length)
        setSettled(true)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[learn] module heat unavailable", error)
        }
        setSettled(true)
      })
    return () => controller.abort()
  }, [topicsKey])

  if (!settled || entries.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Where firms ask this
      </h2>
      <HeatStrip entries={entries} />
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
        n={total} reported occurrences across {firmCount} target{" "}
        {firmCount === 1 ? "firm" : "firms"} · directional signal, not teaching truth
      </p>
    </section>
  )
}
