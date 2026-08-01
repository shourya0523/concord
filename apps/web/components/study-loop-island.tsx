"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { Annotate, PaperSheet, WarrenCallout } from "@/components/paper"

type RagStudyContext = {
  packId: string
  frozenAt: string
  firmNames: string[]
  itemReasons: Record<string, string>
  itemCitations: Record<string, { label: string; url?: string }>
  brief?: string
}

type StudyLoopIslandProps = {
  initialQuestionIds?: string[]
  initialFirmIds?: string[]
  title?: string
  eyebrow?: string
  sessionMode?: "company" | "concept" | "adaptive_weak" | "pseudo_rag" | "simulator"
  learningMode?: "company_prep" | "concept_learn"
  ragContext?: RagStudyContext
}

export function StudyLoopIsland({
  initialQuestionIds = [],
  initialFirmIds = [],
  title = "Study loop",
  eyebrow = "Layered reveal",
  sessionMode = "adaptive_weak",
  learningMode = "concept_learn",
  ragContext,
}: StudyLoopIslandProps) {
  const studyHref = React.useMemo(() => {
    const params = new URLSearchParams()
    if (initialQuestionIds.length > 0) {
      params.set("questions", initialQuestionIds.join(","))
      params.set("question", initialQuestionIds[0]!)
    }
    if (initialFirmIds.length > 0) params.set("firms", initialFirmIds.join(","))
    params.set("mode", sessionMode)
    params.set("learning_mode", learningMode)
    if (ragContext?.packId) params.set("pack", ragContext.packId)
    return `/study?${params.toString()}`
  }, [initialFirmIds, initialQuestionIds, learningMode, ragContext?.packId, sessionMode])

  const firstReason = initialQuestionIds[0]
    ? ragContext?.itemReasons[initialQuestionIds[0]]
    : null
  const firstCitation = initialQuestionIds[0]
    ? ragContext?.itemCitations[initialQuestionIds[0]]
    : null

  return (
    <div className="space-y-4">
      <PaperSheet seedKey={`study-loop-${ragContext?.packId ?? "default"}`}>
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
              <h3 className="font-display text-3xl tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {ragContext?.brief ??
                  `Walking ${initialQuestionIds.length} frozen pack item${
                    initialQuestionIds.length === 1 ? "" : "s"
                  } with the signature reveal loop.`}
              </p>
            </div>
            <Link href={studyHref}>
              <Button type="button" variant="outline">
                Open full study loop
              </Button>
            </Link>
          </div>
          {ragContext ? (
            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
              <div>
                <p className="font-mono text-[10px] tracking-wide uppercase">
                  Pack freeze
                </p>
                <p>
                  {ragContext.packId} · {ragContext.frozenAt.slice(0, 10)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-wide uppercase">
                  Firm context
                </p>
                <p>{ragContext.firmNames.join(" + ") || "Target firms"}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-wide uppercase">
                  Why retrieved
                </p>
                {firstReason ? (
                  <Annotate type="underline" color="var(--graphite)" padding={2}>
                    <span>{firstReason}</span>
                  </Annotate>
                ) : (
                  <p>Heat ∩ weakness ∩ brief match</p>
                )}
              </div>
            </div>
          ) : null}
          {firstCitation ? (
            <p className="text-xs text-muted-foreground">
              Active citation:{" "}
              {firstCitation.url ? (
                <a className="underline" href={firstCitation.url} target="_blank" rel="noreferrer">
                  {firstCitation.label}
                </a>
              ) : (
                firstCitation.label
              )}
            </p>
          ) : null}
        </div>
      </PaperSheet>

      <WarrenCallout mood="idle" bracket>
        The embedded loop below is the same `/study` layered reveal route, seeded with
        frozen pack item IDs and firm context.
      </WarrenCallout>

      <iframe
        title="Embedded pseudo-RAG study loop"
        src={studyHref}
        className="h-[900px] w-full border border-border bg-background"
      />
    </div>
  )
}
