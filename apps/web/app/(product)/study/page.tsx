"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { EditorialHeading, MetadataPill } from "@ibpe/ui/components/editorial"

import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { NotionCallout } from "@/components/mockups/journey-shell"
import { Warren } from "@/components/mockups/warren"

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
    formulae: string[]
    assumptions: string[]
    common_mistakes: string[]
    follow_ups: string[]
    sources: Array<{ label?: string; provenance: string; url?: string }>
  }
  source: string
}

type QuestionList = {
  items: Array<{ id: string }>
}

export default function StudyPage() {
  const [detail, setDetail] = React.useState<StudyDetail | null>(null)
  const [queue, setQueue] = React.useState<string[]>([])
  const [index, setIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(0)
  const [answer, setAnswer] = React.useState("")
  const [confidence, setConfidence] = React.useState(0.5)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState("Loading published teaching answer…")
  const startedAt = React.useRef(0)

  const layers = React.useMemo(() => {
    const study = detail?.study
    if (!study?.direct_answer) return []
    return [
      { label: "Direct answer", body: study.direct_answer },
      {
        label: "Interview-ready explanation",
        body: study.interview_ready_explanation ?? study.direct_answer,
      },
      ...(study.step_by_step.length
        ? [{ label: "Walkthrough", body: study.step_by_step.join("\n\n") }]
        : []),
      ...(study.formulae.length
        ? [{ label: "Formulae", body: study.formulae.join("\n") }]
        : []),
      ...(study.assumptions.length
        ? [{ label: "Assumptions", body: study.assumptions.join("\n") }]
        : []),
      ...(study.common_mistakes.length
        ? [{ label: "Common mistakes", body: study.common_mistakes.join("\n") }]
        : []),
      ...(study.follow_ups.length
        ? [{ label: "Follow-ups", body: study.follow_ups.join("\n") }]
        : []),
    ]
  }, [detail])

  const loadQuestion = React.useCallback(async (questionId: string) => {
    setStatus("Loading published teaching answer…")
    setRevealed(0)
    setAnswer("")
    startedAt.current = Date.now()
    const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}?view=study`)
    if (!response.ok) throw new Error(`Question request failed (${response.status})`)
    const payload = (await response.json()) as StudyDetail
    setDetail(payload)
    setStatus(
      payload.study?.direct_answer
        ? "Teaching answer loaded"
        : "Firm signal loaded; no validated teaching answer is published for this item.",
    )
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
    setRevealed(Math.min(1, layers.length))
    setStatus("Attempt saved. Answer layers unlocked.")
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "r" || e.key === "ArrowRight") {
        e.preventDefault()
        setRevealed((v) => Math.min(layers.length, v + 1))
      }
      if (e.key === "n") {
        e.preventDefault()
        if (queue.length === 0) return
        const next = (index + 1) % queue.length
        setIndex(next)
        void loadQuestion(queue[next]!)
      }
      if (e.key === "p") {
        e.preventDefault()
        if (queue.length === 0) return
        const next = (index - 1 + queue.length) % queue.length
        setIndex(next)
        void loadQuestion(queue[next]!)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, layers.length, loadQuestion, queue])

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
          {detail?.question.canonical_wording ?? status}
        </h2>
        <div className="flex flex-wrap gap-2">
          {detail?.question.topic ? <MetadataPill>{detail.question.topic}</MetadataPill> : null}
          {detail?.question.difficulty ? (
            <MetadataPill>{detail.question.difficulty}</MetadataPill>
          ) : null}
          <MetadataPill>{detail?.source ?? "loading"}</MetadataPill>
        </div>

        {detail?.bank_signals.length ? (
          <NotionCallout>
            <p className="font-medium">Reported firm signal</p>
            <p className="mt-1 text-muted-foreground">
              Seen in {detail.bank_signals.map((signal) => signal.company).join(", ")}. This
              occurrence context does not supply the teaching answer.
            </p>
          </NotionCallout>
        ) : null}

        <PaperSheet seedKey={`study-${detail?.question.id ?? "loading"}`} torn={false}>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="study-answer">
            Your answer
          </label>
          <textarea
            id="study-answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="mt-2 min-h-36 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground"
            placeholder="Lead with structure, then support it…"
          />
          <label className="mt-4 block text-xs font-medium text-muted-foreground">
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
            className="mt-4"
            disabled={!answer.trim() || !sessionId || layers.length === 0}
            onClick={() => void submitAttempt()}
          >
            Submit and reveal
          </Button>
        </PaperSheet>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status}
        </p>

        <ol className="space-y-3">
          {layers.slice(0, revealed).map((layer, i) => (
            <li
              key={layer.label}
              className="border-border border-l-2 border-l-lime/70 py-2 pl-4 text-[15px] leading-relaxed"
            >
              <span className="mb-1 block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {i + 1}. {layer.label}
              </span>
              <span className="whitespace-pre-line">{layer.body}</span>
            </li>
          ))}
        </ol>

        {revealed > 0 && detail?.study?.sources.length ? (
          <section className="border-t border-border pt-4">
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Teaching provenance
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {detail.study.sources.map((source, sourceIndex) => (
                <li key={`${source.provenance}-${sourceIndex}`}>
                  {source.url ? (
                    <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                      {source.label ?? source.provenance}
                    </a>
                  ) : (
                    source.label ?? source.provenance
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
            onClick={() => setRevealed((v) => Math.min(layers.length, v + 1))}
          >
            Reveal next
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (queue.length === 0) return
              const next = (index + 1) % queue.length
              setIndex(next)
              void loadQuestion(queue[next]!)
            }}
          >
            Next question
          </Button>
          <Link href="/learn">
            <Button variant="ghost">Related concept</Button>
          </Link>
        </div>
        {revealed === layers.length && layers.length > 0 ? (
          <NotionCallout warren={<Warren mood="celebrating" size={48} />}>
            Attempt saved and all validated layers reviewed. Your mastery record now includes this
            session.
          </NotionCallout>
        ) : null}
      </article>
    </div>
  )
}
