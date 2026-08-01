"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { RoughHover, Warren } from "@/components/paper"
import { fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import { topicLabel } from "@/lib/topics"

type Props = {
  moduleSlug: string
  topics: string[]
}

/**
 * Module-to-firm bridge: reads the same stored targets as the prep flow and
 * links into Pseudo-RAG with module topic focus when a mapped topic exists.
 */
export function ModuleApplyCtaIsland({ moduleSlug, topics }: Props) {
  const [firmId, setFirmId] = React.useState<string | null>(null)
  const [firmName, setFirmName] = React.useState<string>("your target")

  React.useEffect(() => {
    const first = readStoredTargets()[0] ?? null
    window.queueMicrotask(() => setFirmId(first))
    if (!first) return
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (cancelled) return
      setFirmName(options.find((firm) => firm.id === first)?.name ?? "your target")
    })
    return () => {
      cancelled = true
    }
  }, [])

  const focusTopic = topics[0] ?? null
  const params = new URLSearchParams()
  if (firmId) params.set("firm", firmId)
  if (focusTopic) params.set("topic", focusTopic)
  params.set("module", moduleSlug)
  const href = `/prep/rag?${params.toString()}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={href}>
        <Button>
          <RoughHover padding={3}>
            Apply at {firmId ? firmName : "a firm"}
          </RoughHover>
        </Button>
      </Link>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Warren mood="thinking" size={32} />
        <span>
          {focusTopic
            ? `Focuses the RAG pack on ${topicLabel(focusTopic)}.`
            : "Uses your saved targets when available."}
        </span>
      </div>
    </div>
  )
}
