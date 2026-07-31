"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { DiagramIsland } from "@/components/diagram-island"
import { readStoredTargets } from "@/components/target-select-island"
import {
  Annotate,
  PaperSheet,
  ProvenanceChip,
  SemanticPill,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import { conceptIdForTopic, topicLabel } from "@/lib/topics"

type StudyDetail = {
  question: {
    id: string
    canonical_wording: string
    topic?: string | null
    difficulty?: string | null
  }
  bank_signals: Array<{ company: string; date_posted?: string | null }>
  study?: {
    direct_answer: string | null
    interview_ready_explanation: string | null
    step_by_step: string[]
    diagram_asset?: {
      id: string
      title: string
      body: string
      a11y_fallback: string | null
    } | null
    formulae: string[]
    assumptions: string[]
    common_mistakes: string[]
    follow_ups: string[]
    sources: Array<{ label?: string; provenance: string; url?: string }>
    validation?: { provenance_type: string | null; confidence: number | null } | null
  }
  source: string
}

type QuestionList = {
  items: Array<{ id: string }>
}

type Layer =
  | { kind: "text"; label: string; body: string; annotate?: "highlight" | "underline" | "box" }
  | { kind: "diagram"; label: string; title: string; body: string; a11y: string }
  | { kind: "concepts"; label: string; slug: string | null; topic: string }

const RATING_GUIDE = "Rate honestly — Again/Hard keeps this in your weak set."

export default function StudyPage() {
  const [detail, setDetail] = React.useState<StudyDetail | null>(null)
  const [queue, setQueue] = React.useState<string[]>([])
  const [index, setIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(0)
  const [answer, setAnswer] = React.useState("")
  const [confidence, setConfidence] = React.useState(0.5)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState("Loading published teaching answer…")
  const [submitted, setSubmitted] = React.useState(false)
  const [bookmarked, setBookmarked] = React.useState(false)
  const [conceptSlug, setConceptSlug] = React.useState<string | null>(null)
  const [firstTarget, setFirstTarget] = React.useState<string | null>(null)
  const startedAt = React.useRef(0)
  const typing = answer.trim().length > 0

  React.useEffect(() => {
    setFirstTarget(readStoredTargets()[0] ?? null)
  }, [])

  const layers = React.useMemo<Layer[]>(() => {
    const study = detail?.study
    if (!study?.direct_answer) return []
    const topic = detail?.question.topic ?? null
    const direct = study.direct_answer.trim()
    const interviewReady = (study.interview_ready_explanation ?? "").trim()
    const result: Layer[] = [
      {
        kind: "text",
        label: "Direct answer",
        body: study.direct_answer,
        annotate: "highlight",
      },
      // Skip the interview-ready layer when it adds nothing beyond the direct answer
      ...(interviewReady && interviewReady !== direct
        ? [
            {
              kind: "text" as const,
              label: "Interview-ready explanation",
              body: study.interview_ready_explanation!,
            },
          ]
        : []),
      ...study.step_by_step
        .filter((step) => step.trim() !== direct && step.trim() !== interviewReady)
        .map(
          (step, stepIndex): Layer => ({
            kind: "text",
            label: `Walkthrough · step ${stepIndex + 1}`,
            body: step,
          }),
        ),
      ...(study.diagram_asset
        ? [
            {
              kind: "diagram" as const,
              label: "Diagram",
              title: study.diagram_asset.title,
              body: study.diagram_asset.body,
              a11y: study.diagram_asset.a11y_fallback ?? study.diagram_asset.title,
            },
          ]
        : []),
      ...study.formulae.map(
        (formula): Layer => ({
          kind: "text",
          label: "Formula",
          body: formula,
          annotate: "box",
        }),
      ),
      ...study.assumptions.map(
        (assumption): Layer => ({ kind: "text", label: "Assumption", body: assumption }),
      ),
      ...study.common_mistakes.map(
        (mistake): Layer => ({
          kind: "text",
          label: "Common mistake",
          body: mistake,
          annotate: "underline",
        }),
      ),
      ...study.follow_ups.map(
        (followUp): Layer => ({ kind: "text", label: "Follow-up", body: followUp }),
      ),
      ...(topic && conceptIdForTopic(topic)
        ? [{ kind: "concepts" as const, label: "Related concept lab", slug: conceptSlug, topic }]
        : []),
    ]
    return result
  }, [detail, conceptSlug])

  const loadQuestion = React.useCallback(async (questionId: string) => {
    setStatus("Loading published teaching answer…")
    setRevealed(0)
    setAnswer("")
    setSubmitted(false)
    setBookmarked(false)
    startedAt.current = Date.now()
    const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}?view=study`)
    if (!response.ok) throw new Error(`Question request failed (${response.status})`)
    const payload = (await response.json()) as StudyDetail
    setDetail(payload)
    setStatus(
      payload.study?.direct_answer
        ? "Teaching answer loaded — reveal layers as you master them"
        : "Firm signal loaded; no validated teaching answer is published for this item.",
    )
    const topic = payload.question.topic
    const conceptId = topic ? conceptIdForTopic(topic) : null
    if (conceptId) {
      fetch("/api/concepts")
        .then(async (conceptResponse) =>
          conceptResponse.ok
            ? ((await conceptResponse.json()) as {
                items?: Array<{ concept: { id: string; slug: string } }>
              })
            : null,
        )
        .then((payloadConcepts) => {
          const found = payloadConcepts?.items?.find(
            (item) => item.concept.id === conceptId,
          )
          setConceptSlug(found?.concept.slug ?? null)
        })
        .catch(() => undefined)
    } else {
      setConceptSlug(null)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    const requested = new URLSearchParams(window.location.search).get("question")
    async function initialise() {
      try {
        let ids = requested ? [requested] : []
        if (ids.length === 0) {
          const listResponse = await fetch("/api/questions?limit=8", {
            signal: controller.signal,
          })
          if (!listResponse.ok) throw new Error(`Question list failed (${listResponse.status})`)
          const listed = (await listResponse.json()) as QuestionList
          ids = listed.items.map((item) => item.id)
        }
        if (ids.length === 0) throw new Error("No questions are published yet.")
        setQueue(ids)
        await loadQuestion(ids[0]!)
        const sessionResponse = await fetch("/api/practice/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "adaptive_weak",
            learning_mode: "concept_learn",
            firm_ids: [],
            concept_ids: [],
            question_ids: ids,
            limit: ids.length,
          }),
        })
        if (sessionResponse.ok) {
          const session = (await sessionResponse.json()) as { session: { id: string } }
          setSessionId(session.session.id)
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setStatus(caught instanceof Error ? caught.message : "Study loop unavailable.")
      }
    }
    void initialise()
    return () => controller.abort()
  }, [loadQuestion])

  async function submitAttempt() {
    if (!detail || !sessionId) return
    setStatus("Saving attempt…")
    const response = await fetch(`/api/practice/sessions/${sessionId}/attempts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canonical_question_id: detail.question.id,
        response_text: answer,
        confidence,
        correct: null,
        time_spent_ms: Date.now() - startedAt.current,
      }),
    })
    if (!response.ok) {
      setStatus(`Attempt could not be saved (${response.status}).`)
      return
    }
    setSubmitted(true)
    setRevealed(Math.min(1, layers.length))
    setStatus("Attempt saved. Answer layers unlocked.")
  }

  async function toggleBookmark() {
    if (!detail) return
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_kind: "canonical_question",
        entity_id: detail.question.id,
        firm_ids: [],
        tags: [],
      }),
    })
    if (response.ok) setBookmarked(true)
  }

  function nextQuestion(delta: 1 | -1) {
    if (queue.length === 0) return
    const next = (index + delta + queue.length) % queue.length
    setIndex(next)
    void loadQuestion(queue[next]!)
  }

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === "r" || event.key === "ArrowRight") {
        event.preventDefault()
        setRevealed((value) => Math.min(layers.length, value + 1))
      }
      if (event.key === "n") {
        event.preventDefault()
        nextQuestion(1)
      }
      if (event.key === "p") {
        event.preventDefault()
        nextQuestion(-1)
      }
      if (event.key === "b") {
        event.preventDefault()
        void toggleBookmark()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const topic = detail?.question.topic ?? null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Study · layered reveal
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Study</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <MetadataPill>r reveal</MetadataPill>
          <MetadataPill>n next</MetadataPill>
          <MetadataPill>p prev</MetadataPill>
          <MetadataPill>b bookmark</MetadataPill>
        </div>
      </div>

      <article className="space-y-6">
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          {detail?.question.canonical_wording ?? status}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {topic ? <MetadataPill>{topicLabel(topic)}</MetadataPill> : null}
          {detail?.question.difficulty ? (
            <MetadataPill>{detail.question.difficulty}</MetadataPill>
          ) : null}
          <MetadataPill>{detail?.source ?? "loading"}</MetadataPill>
          {detail?.study?.validation?.provenance_type ? (
            <ProvenanceChip provenance={detail.study.validation.provenance_type} />
          ) : null}
          {bookmarked ? <SemanticPill tone="milestone">Bookmarked</SemanticPill> : null}
        </div>

        {detail?.bank_signals.length ? (
          <WarrenCallout mood="idle" bracket size={44}>
            Seen in reported interviews at{" "}
            {detail.bank_signals.map((signal) => signal.company).join(", ")} — occurrence context
            only; the teaching answer below comes from the corpus.
          </WarrenCallout>
        ) : null}

        <PaperSheet seedKey={`study-${detail?.question.id ?? "loading"}`} torn={false}>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="study-answer">
            Your answer — Warren waits while you write
          </label>
          <textarea
            id="study-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="mt-2 min-h-36 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground"
            placeholder="Lead with structure, then support it…"
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="min-w-40 flex-1 text-xs font-medium text-muted-foreground">
              Confidence · {Math.round(confidence * 100)}%
              <input
                className="mt-2 block w-full accent-black"
                type="range"
                min="0"
                max="1"
                step="0.25"
                value={confidence}
                onChange={(event) => setConfidence(Number(event.target.value))}
              />
            </label>
            <Button
              disabled={!answer.trim() || !sessionId || layers.length === 0 || submitted}
              onClick={() => void submitAttempt()}
            >
              {submitted ? "Attempt saved" : "Submit and reveal"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{RATING_GUIDE}</p>
        </PaperSheet>

        <div className="flex items-center gap-3">
          <Warren mood={typing ? "paused" : "idle"} userFocused={typing} size={40} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>

        <ol className="space-y-3">
          {layers.slice(0, revealed).map((layer, layerIndex) => {
            const annotation =
              layer.kind === "text" && layer.annotate && revealed > layerIndex
                ? layer.annotate
                : undefined
            const annotationColor =
              annotation === "highlight"
                ? "var(--success)"
                : annotation === "underline"
                  ? "var(--error-foreground)"
                  : "var(--ink)"
            return (
              <li
                key={`${layer.label}-${layerIndex}`}
                className="border-border border-l-2 py-2 pl-4 text-[15px] leading-relaxed motion-safe:animate-[settle-in_280ms_var(--ease-settle)]"
                style={{ borderLeftColor: "var(--graphite)" }}
              >
                <span className="mb-1 block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                  {layerIndex + 1}. {layer.label}
                </span>
                {layer.kind === "diagram" ? (
                  <DiagramIsland title={layer.title} source={layer.body} a11yFallback={layer.a11y} />
                ) : layer.kind === "concepts" ? (
                  layer.slug ? (
                    <Link
                      className="text-foreground underline underline-offset-4 hover:underline"
                      href={`/concepts/${layer.slug}`}
                    >
                      Open the {topicLabel(layer.topic)} concept lab →
                    </Link>
                  ) : (
                    <Link
                      className="text-foreground underline underline-offset-4 hover:underline"
                      href="/concepts"
                    >
                      Browse concept labs →
                    </Link>
                  )
                ) : annotation ? (
                  <Annotate type={annotation} color={annotationColor} padding={3}>
                    <span className="whitespace-pre-line">{layer.body}</span>
                  </Annotate>
                ) : (
                  <span className="whitespace-pre-line">{layer.body}</span>
                )}
              </li>
            )
          })}
        </ol>

        {revealed > 0 && detail?.study?.sources.length ? (
          <section className="border-t border-border pt-4">
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Sources · provenance · validation
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {detail.study.sources.map((source, sourceIndex) => (
                <li key={`${source.provenance}-${sourceIndex}`} className="flex flex-wrap items-center gap-2">
                  <ProvenanceChip provenance={source.provenance} />
                  {source.url ? (
                    <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                      {source.label ?? source.provenance}
                    </a>
                  ) : (
                    <span>{source.label ?? source.provenance}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={revealed === 0 || revealed >= layers.length}
            onClick={() => setRevealed((value) => Math.min(layers.length, value + 1))}
          >
            Reveal next
          </Button>
          <Button type="button" variant="outline" onClick={() => nextQuestion(1)}>
            Next question
          </Button>
          {!bookmarked ? (
            <Button type="button" variant="ghost" onClick={() => void toggleBookmark()}>
              Bookmark
            </Button>
          ) : null}
          {topic && firstTarget ? (
            <Link href={`/companies/${firstTarget.replace(/^firm_/, "")}?focus=${topic}`}>
              <Button variant="ghost">See how your target asks this</Button>
            </Link>
          ) : null}
        </div>

        {revealed === layers.length && layers.length > 0 ? (
          <WarrenCallout mood="celebrating" size={48}>
            All validated layers reviewed and your attempt is saved — this session now feeds your
            mastery record and the next pack&apos;s ranking.
          </WarrenCallout>
        ) : null}
      </article>
    </div>
  )
}
