"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { EditorialHeading, MetadataPill } from "@ibpe/ui/components/editorial"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"

import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { RAG_CITATIONS } from "@/lib/mock-data"

export default function StudyPage() {
  const [index, setIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(0)
  const item = RAG_CITATIONS[index % RAG_CITATIONS.length]!

  const layers = [
    item.excerpt,
    "Interview-ready: lead with structure, then numbers, then risks.",
    "Walkthrough: define the ask → set up sources/uses or WACC → bridge to the punchline.",
    "Common miss: skipping the firm signal context when in Mode A.",
  ]

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "r" || e.key === "ArrowRight") {
        e.preventDefault()
        setRevealed((v) => Math.min(layers.length, v + 1))
      }
      if (e.key === "n") {
        e.preventDefault()
        setIndex((i) => (i + 1) % RAG_CITATIONS.length)
        setRevealed(0)
      }
      if (e.key === "p") {
        e.preventDefault()
        setIndex((i) => (i - 1 + RAG_CITATIONS.length) % RAG_CITATIONS.length)
        setRevealed(0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [layers.length])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <EditorialHeading eyebrow="Adaptive study" as="h1">
          Signature reveal
        </EditorialHeading>
        <div className="flex flex-wrap gap-2">
          <MetadataPill>r reveal</MetadataPill>
          <MetadataPill>n next</MetadataPill>
          <MetadataPill>p prev</MetadataPill>
        </div>
      </div>

      <WeakTopicFocusBar />

      <article className="space-y-6">
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          {item.title}
        </h2>
        <PseudoRagCitationCard
          title="Citation anchor"
          excerpt={item.excerpt}
          whyRetrieved={item.whyRetrieved}
          provenance={item.provenance}
          score={item.score}
        />

        <ol className="space-y-3">
          {layers.slice(0, revealed).map((text, i) => (
            <li
              key={i}
              className="border-border border-l-2 border-l-lime/70 py-2 pl-4 text-[15px] leading-relaxed"
            >
              <span className="mb-1 block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                Layer {i + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setRevealed((v) => Math.min(layers.length, v + 1))}>
            Reveal next
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIndex((i) => (i + 1) % RAG_CITATIONS.length)
              setRevealed(0)
            }}
          >
            Next question
          </Button>
          <Link href="/concepts/dcf-valuation">
            <Button variant="ghost">Related concept</Button>
          </Link>
        </div>
      </article>
    </div>
  )
}
