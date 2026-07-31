"use client"

import * as React from "react"
import Link from "next/link"

import { fetchFirmOptions } from "@/components/target-select-island"
import { weakTopicsFromMastery } from "@/lib/weak-topics"

export type FirmBridgeEntry = {
  firmId: string
  intensity: number
}

/**
 * "Where this shows up" — firm chips for concept firm_relevance ≥ 0.5.
 * Intensity number always shown; hatch overlay marks the topic when it is
 * weak for the user (never hue alone).
 */
export function ConceptFirmBridgesIsland({
  entries,
  topic,
}: {
  entries: FirmBridgeEntry[]
  topic: string | null
}) {
  const [names, setNames] = React.useState<Map<string, string>>(new Map())
  const [weak, setWeak] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (!cancelled) {
        setNames(new Map(options.map((option) => [option.id, option.name])))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!topic) return
    const controller = new AbortController()
    fetch("/api/mastery", { signal: controller.signal })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items?: Array<{ subject_type: string; subject_id: string; score: number }>
            })
          : { items: [] },
      )
      .then((payload) => {
        const weakTopics = weakTopicsFromMastery(
          (payload.items ?? []).map((item) => ({
            subject_type: item.subject_type as "concept",
            subject_id: item.subject_id,
            score: item.score,
          })),
        )
        setWeak(weakTopics.some((entry) => entry.topic === topic))
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[concepts] mastery unavailable for weak overlay", error)
        }
      })
    return () => controller.abort()
  }, [topic])

  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map((entry) => {
        const slug = entry.firmId.replace(/^firm_/, "")
        const name = names.get(entry.firmId) ?? slug.replace(/_/g, " ")
        return (
          <li key={entry.firmId}>
            <Link
              href={`/companies/${slug}`}
              className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-border px-3 py-1 text-xs hover:border-ink/50"
              title={`${name} · heat intensity ${entry.intensity.toFixed(2)}`}
            >
              {weak ? (
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,var(--weak)_3px,var(--weak)_4px)] opacity-35"
                />
              ) : null}
              <span className="relative font-medium">{name}</span>
              <span className="relative font-mono text-[10px] text-muted-foreground">
                {entry.intensity.toFixed(2)}
              </span>
              {weak ? <span className="sr-only"> (weak topic for you)</span> : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
