"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"

import { TargetSelectIsland, readStoredTargets } from "@/components/target-select-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { FIRMS } from "@/lib/mock-data"

type RagHit = {
  id: string
  title: string
  snippet?: string
  score: number
  provenance?: string
  metadata: Record<string, unknown>
}

type RagResponse = {
  pack: { id: string; frozen_at: string; item_ids: string[] }
  hits: RagHit[]
  explanations: Array<{ item_id: string; reasons: string[] }>
  source: string
  notes: string[]
}

export function RagPrepIsland() {
  const [focusPrompt, setFocusPrompt] = React.useState("Superday technicals: accounting and paper LBO")
  const [targets, setTargets] = React.useState<string[]>([])
  const [focusTopic, setFocusTopic] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<RagResponse | null>(null)
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    setTargets(readStoredTargets())
  }, [])

  const firmNames = FIRMS.filter((f) => targets.includes(f.id))
    .map((f) => f.name)
    .join(" · ")

  async function retrieve() {
    if (targets.length === 0) {
      setError("Choose at least one target firm before retrieving a pack.")
      setStatus("error")
      return
    }
    setStatus("loading")
    setError("")
    try {
      const response = await fetch("/api/prep/rag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firm_ids: targets,
          query: focusPrompt,
          weak_topics: focusTopic ? [focusTopic] : [],
          limit: 6,
        }),
      })
      if (!response.ok) throw new Error(`Retrieval failed (${response.status})`)
      setResult((await response.json()) as RagResponse)
      setStatus("idle")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retrieve a grounded pack.")
      setStatus("error")
    }
  }

  const explanationMap = new Map(
    result?.explanations.map((item) => [item.item_id, item.reasons.join(" · ")]) ?? [],
  )

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Focus prompt
            </span>
            <Input
              value={focusPrompt}
              onChange={(e) => setFocusPrompt(e.target.value)}
              aria-label="Pseudo-RAG focus prompt"
            />
          </label>
          <TargetSelectIsland value={targets} onChange={setTargets} />
        </div>
        <WeakTopicFocusBar focusedId={focusTopic} onFocusChange={setFocusTopic} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={status === "loading" || targets.length === 0}
          onClick={() => void retrieve()}
        >
          {status === "loading" ? "Retrieving…" : "Retrieve grounded pack"}
        </Button>
        <Link
          href={
            result?.pack.item_ids.length
              ? `/study?session=${encodeURIComponent(result.pack.id)}&question=${encodeURIComponent(result.pack.item_ids[0] ?? "")}`
              : "/study"
          }
          aria-disabled={!result}
        >
          <Button type="button" variant="outline">
            Start study loop
          </Button>
        </Link>
        {result ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Frozen · {result.pack.frozen_at.slice(0, 10)} · {result.source}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border border-dashed border-error px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="space-y-4" aria-live="polite">
          <header className="space-y-1">
            <h2 className="font-display text-3xl tracking-tight">Grounded pack</h2>
            <p className="text-sm text-muted-foreground">
              Ranked by firm heat ∩ weak topics ∩ prompt similarity
              {firmNames ? ` · ${firmNames}` : ""}. Every card carries citations —
              Glassdoor rows are signals only.
            </p>
          </header>
          <div className="flex flex-col gap-3">
            {result.hits.map((hit) => (
              <PseudoRagCitationCard
                key={hit.id}
                title={hit.title}
                excerpt={hit.snippet ?? "Open the study loop for the published teaching answer."}
                whyRetrieved={explanationMap.get(hit.id) ?? "Semantic match to your focus prompt"}
                provenance={
                  hit.provenance === "github_source"
                    ? "github-corpus"
                    : hit.provenance === "gemini_synthesised"
                      ? "gemini-enriched"
                      : "editorial"
                }
                score={hit.score}
                sourceUrl={
                  typeof hit.metadata.source_url === "string"
                    ? hit.metadata.source_url
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
