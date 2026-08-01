"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"

import { StudyLoopIsland } from "@/components/study-loop-island"
import {
  TargetSelectIsland,
  fetchFirmOptions,
  readStoredTargets,
  writeStoredTargets,
} from "@/components/target-select-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { Annotate, PaperSheet, WarrenCallout } from "@/components/paper"
import { conceptSlugForTopic, topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery } from "@/lib/weak-topics"

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
  brief?: string
  brief_source?: "gemini" | "template"
  brief_citations?: Array<{ item_id: string; label: string }>
  notes: string[]
}

type Props = {
  initialFirmIds?: string[]
  initialTopic?: string | null
}

function promptForTopic(topic: string | null | undefined) {
  return topic
    ? `Focus this pack on ${topicLabel(topic)} for my target firm prep`
    : "Superday technicals: accounting and paper LBO"
}

export function RagPrepIsland({ initialFirmIds = [], initialTopic = null }: Props) {
  const initialFirmIdsKey = initialFirmIds.join(",")
  const [focusPrompt, setFocusPrompt] = React.useState(() => promptForTopic(initialTopic))
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<string[]>([])
  const [focusTopic, setFocusTopic] = React.useState<string | null>(initialTopic)
  const [weakTopics, setWeakTopics] = React.useState<string[]>([])
  const [result, setResult] = React.useState<RagResponse | null>(null)
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">(
    "idle"
  )
  const [error, setError] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const [loopStarted, setLoopStarted] = React.useState(false)

  React.useEffect(() => {
    if (initialFirmIds.length > 0) {
      setTargets(initialFirmIds)
      writeStoredTargets(initialFirmIds)
    } else {
      setTargets(readStoredTargets())
    }
    const controller = new AbortController()
    fetch("/api/mastery", { signal: controller.signal })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items?: Array<{
                score: number
                subject_id: string
                subject_type: string
              }>
            })
          : { items: [] }
      )
      .then((payload) => {
        setWeakTopics(
          weakTopicsFromMastery(
            (payload.items ?? []).map((item) => ({
              subject_type: item.subject_type as "concept",
              subject_id: item.subject_id,
              score: item.score,
            }))
          ).map((entry) => entry.topic)
        )
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [initialFirmIdsKey])

  React.useEffect(() => {
    setFocusTopic(initialTopic)
    if (initialTopic) setFocusPrompt(promptForTopic(initialTopic))
  }, [initialTopic])

  React.useEffect(() => {
    if (targets.length === 0) {
      setFirmNames([])
      return
    }
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (cancelled) return
      const names = options
        .filter((firm) => targets.includes(firm.id))
        .map((firm) => firm.name)
      setFirmNames(names)
    })
    return () => {
      cancelled = true
    }
  }, [targets])

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
          weak_topics: focusTopic ? [focusTopic] : weakTopics,
          limit: 6,
        }),
      })
      if (!response.ok) throw new Error(`Retrieval failed (${response.status})`)
      setResult((await response.json()) as RagResponse)
      setLoopStarted(false)
      setStatus("idle")
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not retrieve a grounded pack."
      )
      setStatus("error")
    }
  }

  const explanationMap = new Map(
    result?.explanations.map((item) => [
      item.item_id,
      item.reasons.join(" · "),
    ]) ?? []
  )
  const itemReasons =
    result?.explanations.reduce<Record<string, string>>((acc, item) => {
      acc[item.item_id] = item.reasons.join(" · ")
      return acc
    }, {}) ?? {}
  const itemCitations =
    result?.hits.reduce<Record<string, { label: string; url?: string }>>(
      (acc, hit) => {
        acc[hit.id] = {
          label: `${hit.id} · ${hit.provenance ?? "corpus"}`,
          url:
            typeof hit.metadata.source_url === "string"
              ? hit.metadata.source_url
              : undefined,
        }
        return acc
      },
      {}
    ) ?? {}
  const focusConceptSlug = focusTopic ? conceptSlugForTopic(focusTopic) : null

  return (
    <div className="space-y-8">
      <WarrenCallout mood="thinking" bracket>
        {targets.length > 0
          ? `Packing for ${firmNames.join(" + ") || "your firms"} — heat ∩ your weak topics ∩ the prompt. Pack freezes when retrieved; citations stay attached.`
          : "Pick target firms first — the pack ranks teaching answers by their interview signals."}
      </WarrenCallout>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Session brief
            </span>
            <Input
              value={focusPrompt}
              onChange={(e) => setFocusPrompt(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-label="Pseudo-RAG session brief"
            />
          </label>
          <TargetSelectIsland value={targets} onChange={setTargets} />
        </div>
        <WeakTopicFocusBar
          focusedId={focusTopic}
          onFocusChange={setFocusTopic}
        />
      </div>

      {focusTopic ? (
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-border px-4 py-3">
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Heat focus · {topicLabel(focusTopic)}
          </span>
          {focusConceptSlug ? (
            <Link href={`/concepts/${focusConceptSlug}`}>
              <Button type="button" variant="outline">
                Open concept lab
              </Button>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={status === "loading" || targets.length === 0}
          onClick={() => void retrieve()}
        >
          {status === "loading" ? "Retrieving…" : "Retrieve grounded pack"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!result?.pack.item_ids.length}
          onClick={() => setLoopStarted(true)}
        >
          {loopStarted ? "Study loop started" : "Start study loop"}
        </Button>
        {result ? (
          <Annotate type="box" color="var(--graphite)" padding={4}>
            <span className="font-mono text-[11px] text-muted-foreground">
              Frozen · {result.pack.frozen_at.slice(0, 10)} ·{" "}
              {result.pack.item_ids.length} items · {result.source}
            </span>
          </Annotate>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="border border-dashed border-error px-4 py-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="space-y-4" aria-live="polite">
          <header className="space-y-1">
            <h2 className="font-display text-3xl tracking-tight">
              Pack preview
            </h2>
            <p className="text-sm text-muted-foreground">
              Ranked by firm heat ∩ weak topics ∩ brief similarity
              {firmNames.length ? ` · ${firmNames.join(" · ")}` : ""}. Every
              card carries its retrieval reasons and citations — Glassdoor rows
              are signals only.
            </p>
          </header>
          {result.brief ? (
            <PaperSheet seedKey={`rag-brief-${result.pack.id}`} torn={false}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                    Grounded brief
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                    {result.brief_source === "gemini"
                      ? "Gemini rewrite"
                      : "Template"}
                  </span>
                </div>
                <p className="text-sm leading-6">{result.brief}</p>
                {result.brief_citations?.length ? (
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label="Brief citations"
                  >
                    {result.brief_citations.map((citation) => (
                      <span
                        key={citation.item_id}
                        className="rounded-full border border-ink/20 bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                        title={citation.item_id}
                      >
                        {citation.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </PaperSheet>
          ) : null}
          <div className="flex flex-col gap-3">
            {result.hits.map((hit) => (
              <PseudoRagCitationCard
                key={hit.id}
                title={hit.title}
                excerpt={
                  hit.snippet ??
                  "Open the study loop for the published teaching answer."
                }
                whyRetrieved={
                  explanationMap.get(hit.id) ??
                  "Semantic match to your session brief"
                }
                provenance={
                  hit.provenance === "github_source"
                    ? "github-corpus"
                    : hit.provenance === "gemini_synthesised"
                      ? "gemini-enriched"
                      : hit.provenance === "glassdoor_occurrence"
                        ? "glassdoor-signal"
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
          {loopStarted ? (
            <section className="border-t border-border pt-6">
              <StudyLoopIsland
                title="Pseudo-RAG study loop"
                eyebrow="Mode A · frozen pack · layered reveal"
                initialQuestionIds={result.pack.item_ids}
                initialFirmIds={targets}
                sessionMode="pseudo_rag"
                learningMode="company_prep"
                ragContext={{
                  packId: result.pack.id,
                  frozenAt: result.pack.frozen_at,
                  firmNames,
                  itemReasons,
                  itemCitations,
                  brief: result.brief,
                }}
              />
            </section>
          ) : (
            <PaperSheet seedKey={`rag-close-${result.pack.id}`} torn={false}>
              <div className="space-y-2">
                <p className="font-medium">Ready for the real session.</p>
                <p className="text-sm text-muted-foreground">
                  Start study loop freezes this pack into a pseudo-RAG practice
                  session. Attempts use the existing practice API for mastery
                  when auth is available; anonymous users still get the layered
                  reveal and close recommendations.
                </p>
              </div>
            </PaperSheet>
          )}
        </section>
      ) : null}
    </div>
  )
}
