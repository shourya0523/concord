"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"

import { TargetSelectIsland, readStoredTargets } from "@/components/target-select-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { MOCK_RAG_PACK, RAG_CITATIONS, FIRMS } from "@/lib/mock-data"

export function RagPrepIsland() {
  const [focusPrompt, setFocusPrompt] = React.useState(MOCK_RAG_PACK.query)
  const [targets, setTargets] = React.useState<string[]>([])
  const [focusTopic, setFocusTopic] = React.useState<string | null>(null)
  const [ran, setRan] = React.useState(true)

  React.useEffect(() => {
    setTargets(readStoredTargets())
  }, [])

  const firmNames = FIRMS.filter((f) => targets.includes(f.id))
    .map((f) => f.name)
    .join(" · ")

  const citations = focusTopic
    ? RAG_CITATIONS.filter((c) => {
        const blob = `${c.title} ${c.whyRetrieved}`.toLowerCase()
        if (focusTopic === "topic_dcf") return blob.includes("dcf") || blob.includes("wacc")
        if (focusTopic === "topic_lbo") return blob.includes("lbo")
        if (focusTopic === "topic_acct") return blob.includes("accounting") || blob.includes("statement")
        return true
      })
    : RAG_CITATIONS

  const shown = citations.length ? citations : RAG_CITATIONS

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
          onClick={() => {
            setRan(true)
          }}
        >
          Retrieve grounded pack
        </Button>
        <Link href="/study">
          <Button type="button" variant="outline">
            Start study loop
          </Button>
        </Link>
        <p className="font-mono text-[11px] text-muted-foreground">
          Frozen · {MOCK_RAG_PACK.frozen_at.slice(0, 10)} · stub pack
        </p>
      </div>

      {ran ? (
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
            {shown.map((c) => (
              <PseudoRagCitationCard
                key={c.id}
                title={c.title}
                excerpt={c.excerpt}
                whyRetrieved={c.whyRetrieved}
                provenance={c.provenance}
                score={c.score}
                sourceUrl={c.sourceUrl}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
