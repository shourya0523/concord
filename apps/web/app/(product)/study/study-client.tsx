"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { cn } from "@ibpe/ui/lib/utils"

import type { ActivityResult, DeliveryScore } from "@ibpe/contracts"

import { DiagramIsland } from "@/components/diagram-island"
import { GradeFeedbackCard } from "@/components/grade-feedback-card"
import { VoiceAnswer } from "@/components/voice-answer"
import { fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import {
  Annotate,
  HeatStrip,
  InkHoverScope,
  NotionCallout,
  PaperBurst,
  PaperSheet,
  ProvenanceChip,
  RoughHover,
  SemanticPill,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import { conceptIdForTopic, topicLabel } from "@/lib/topics"
import { pitfallForTopic } from "@/lib/pitfalls"
import { weakTopicsFromMastery } from "@/lib/weak-topics"
import { describeDue } from "@/lib/review-schedule"
import type { AttemptGradeResponse } from "@/lib/api/schemas"
import {
  followUpResponseText,
  gradeStatus,
  postAttempt,
  withDelivery,
} from "@/lib/simulator/attempt-client"

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
const RATINGS = [
  { label: "Again", rating: "again", confidence: 0.25, tone: "error" },
  { label: "Hard", rating: "hard", confidence: 0.5, tone: "weak" },
  { label: "Good", rating: "good", confidence: 0.75, tone: "success" },
  { label: "Easy", rating: "easy", confidence: 1, tone: "streak" },
] as const

export function StudyClient({ voiceEnabled = false }: { voiceEnabled?: boolean }) {
  const [detail, setDetail] = React.useState<StudyDetail | null>(null)
  const [queue, setQueue] = React.useState<string[]>([])
  const [index, setIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(0)
  const [answer, setAnswer] = React.useState("")
  const [confidence, setConfidence] = React.useState(0.5)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState("Loading published teaching answer…")
  const [submitted, setSubmitted] = React.useState(false)
  const [bookmarkId, setBookmarkId] = React.useState<string | null>(null)
  const bookmarked = bookmarkId !== null
  const [conceptSlug, setConceptSlug] = React.useState<string | null>(null)
  const [firstTarget, setFirstTarget] = React.useState<string | null>(null)
  const [firstTargetName, setFirstTargetName] = React.useState<string | null>(null)
  const [weakTopicSet, setWeakTopicSet] = React.useState<Set<string>>(new Set())
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
  const [noteOpen, setNoteOpen] = React.useState(false)
  const [noteBody, setNoteBody] = React.useState("")
  const [noteSaved, setNoteSaved] = React.useState(false)
  const [peekHeat, setPeekHeat] = React.useState<
    Array<{ topic: string; intensity: number; sampleSize: number }>
  >([])
  const [attemptCount, setAttemptCount] = React.useState(0)
  const [hintOpen, setHintOpen] = React.useState(false)
  const [reviewMode, setReviewMode] = React.useState(false)
  const [collections, setCollections] = React.useState<
    Array<{ id: string; title: string; items: Array<{ entity_kind: string; entity_id: string }> }>
  >([])
  const [collectionId, setCollectionId] = React.useState("")
  const [grade, setGrade] = React.useState<AttemptGradeResponse | null>(null)
  const [activity, setActivity] = React.useState<ActivityResult | null>(null)
  const [delivery, setDelivery] = React.useState<DeliveryScore | null>(null)
  /** question id → ISO time the gold answer was first revealed (anti-gaming, P3.4). */
  const revealedAtRef = React.useRef<Record<string, string>>({})
  const startedAt = React.useRef(0)
  const typing = answer.trim().length > 0

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const firmIds = params
      .get("firms")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const target = firmIds?.[0] ?? readStoredTargets()[0] ?? null
    window.queueMicrotask(() => {
      setFirstTarget(target)
      if (!target) setFirstTargetName(null)
    })
    if (target) {
      void fetchFirmOptions().then((options) => {
        setFirstTargetName(options.find((firm) => firm.id === target)?.name ?? target)
      })
    }
    fetch("/api/collections")
      .then(async (response) =>
        response.ok ? ((await response.json()) as { items?: typeof collections }) : { items: [] },
      )
      .then((payload) => {
        setCollections(payload.items ?? [])
        setCollectionId(payload.items?.[0]?.id ?? "")
      })
      .catch(() => undefined)
    fetch("/api/mastery")
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items?: Array<{ subject_type: string; subject_id: string; score: number }>
            })
          : { items: [] },
      )
      .then((payload) => {
        setWeakTopicSet(
          new Set(
            weakTopicsFromMastery(
              (payload.items ?? []).map((item) => ({
                subject_type: item.subject_type as "concept",
                subject_id: item.subject_id,
                score: item.score,
              })),
            ).map((entry) => entry.topic),
          ),
        )
      })
      .catch(() => undefined)
  }, [])

  // Thinking timer — calm mono counter until the attempt is submitted.
  React.useEffect(() => {
    if (submitted || !detail) return
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [submitted, detail])

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

  // Record when the gold answer is first revealed for a question; later
  // attempts on it carry `revealed_at` so the grader can discount copies.
  const detailId = detail?.question.id ?? null
  React.useEffect(() => {
    if (!detailId || revealed === 0 || revealedAtRef.current[detailId]) return
    revealedAtRef.current[detailId] = new Date().toISOString()
  }, [detailId, revealed])

  const loadQuestion = React.useCallback(async (questionId: string) => {
    setStatus("Loading published teaching answer…")
    setRevealed(0)
    setAnswer("")
    setSubmitted(false)
    setBookmarkId(null)
    setHintOpen(false)
    setGrade(null)
    setActivity(null)
    setDelivery(null)
    startedAt.current = Date.now()
    const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}?view=study`)
    if (!response.ok) throw new Error(`Question request failed (${response.status})`)
    const payload = (await response.json()) as StudyDetail
    setDetail(payload)
    fetch("/api/bookmarks")
      .then(async (bookmarkResponse) =>
        bookmarkResponse.ok
          ? ((await bookmarkResponse.json()) as {
              items?: Array<{ id: string; entity_kind: string; entity_id: string }>
            })
          : { items: [] },
      )
      .then((bookmarks) => {
        const existing = bookmarks.items?.find(
          (item) => item.entity_kind === "question" && item.entity_id === questionId,
        )
        setBookmarkId(existing?.id ?? null)
      })
      .catch(() => undefined)
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
    const params = new URLSearchParams(window.location.search)
    const requested = params.get("question")
    const requestedQueue = params
      .get("questions")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const requestedFirms =
      params
        .get("firms")
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? []
    const requestedMode =
      params.get("mode") === "rag" || params.get("mode") === "pseudo_rag"
        ? "rag"
        : "adaptive_weak"
    const requestedTopic = params.get("topic")?.trim() || null
    const requestedReview = params.get("review") === "due"
    const requestedLearningMode =
      params.get("learning_mode") === "company_prep"
        ? "company_prep"
        : "concept_learn"
    async function initialise() {
      try {
        let ids = requestedQueue?.length
          ? requestedQueue
          : requested
            ? [requested]
            : []
        let reviewNotice: string | null = null
        if (ids.length === 0 && requestedReview) {
          const dueResponse = await fetch("/api/review/due?limit=20", {
            signal: controller.signal,
          })
          if (dueResponse.ok) {
            const due = (await dueResponse.json()) as {
              items: Array<{ question_id: string }>
              next_due_at: string | null
            }
            ids = due.items.map((item) => item.question_id)
            if (ids.length > 0) {
              setReviewMode(true)
            } else {
              reviewNotice = (
                due.next_due_at
                  ? `Nothing due for review — next card ${describeDue(due.next_due_at)}. Practising fresh questions instead.`
                  : "Nothing scheduled for review yet — rate a few answers first."
              )
            }
          }
        }
        if (ids.length === 0 && requestedTopic) {
          const topicResponse = await fetch(
            `/api/questions?topic=${encodeURIComponent(requestedTopic)}&limit=8`,
            { signal: controller.signal },
          )
          if (topicResponse.ok) {
            const listed = (await topicResponse.json()) as QuestionList
            ids = listed.items.map((item) => item.id)
          }
        }
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
        if (reviewNotice) setStatus(reviewNotice)
        const sessionResponse = await fetch("/api/practice/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: requestedMode,
            learning_mode: requestedLearningMode,
            firm_ids: requestedFirms,
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
    if (!detail) return
    if (!sessionId) {
      setSubmitted(true)
      setRevealed(Math.min(1, layers.length))
      setStatus("Anonymous reveal unlocked. Sign in to save mastery for this pack.")
      return
    }
    setStatus("Saving attempt…")
    const result = await postAttempt(sessionId, {
      canonical_question_id: detail.question.id,
      response_text: answer,
      confidence,
      rating: RATINGS.find((item) => item.confidence === confidence)?.rating,
      correct: null,
      time_spent_ms: Date.now() - startedAt.current,
      revealed_at: revealedAtRef.current[detail.question.id],
      delivery,
    }).catch(() => ({ ok: false as const, status: 0 }))
    if (!result.ok) {
      setSubmitted(true)
      setRevealed(Math.min(1, layers.length))
      setStatus(
        `Attempt could not be saved (${result.status || "network"}); answer layers unlocked anonymously.`,
      )
      return
    }
    setSubmitted(true)
    setAttemptCount((count) => count + 1)
    setRevealed(Math.min(1, layers.length))
    setGrade(result.grade ? withDelivery(result.grade, delivery) : null)
    setActivity(result.activity)
    const graded = result.grade ? `${gradeStatus(result.grade)} — feedback below. ` : ""
    setStatus(
      result.review
        ? `${graded}Attempt saved — back for review ${describeDue(result.review.due_at)}. Answer layers unlocked.`
        : `${graded}Attempt saved. Answer layers unlocked.`,
    )
  }

  /** Optional second try on the interviewer follow-up — same question, same rubric. */
  async function submitFollowUp(
    followUpAnswer: string,
    followUp: string,
  ): Promise<AttemptGradeResponse | null> {
    if (!detail || !sessionId) return null
    const result = await postAttempt(sessionId, {
      canonical_question_id: detail.question.id,
      response_text: followUpResponseText(followUp, followUpAnswer),
      confidence,
      correct: null,
      time_spent_ms: Date.now() - startedAt.current,
      revealed_at: revealedAtRef.current[detail.question.id],
    }).catch(() => null)
    if (!result?.ok || !result.grade) return null
    if (result.activity) setActivity(result.activity)
    setStatus(`Follow-up: ${gradeStatus(result.grade)}.`)
    return result.grade
  }

  async function saveNote() {
    if (!detail || !noteBody.trim()) return
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question_id: detail.question.id,
        body: noteBody.trim(),
      }),
    })
    if (response.status === 401) {
      setStatus("Sign in to keep notes — your wording is still in the editor.")
      return
    }
    if (response.ok) {
      setNoteSaved(true)
      setNoteBody("")
      setNoteOpen(false)
      window.setTimeout(() => setNoteSaved(false), 2000)
    }
  }

  async function toggleBookmark() {
    if (!detail) return
    if (bookmarkId) {
      const response = await fetch(`/api/bookmarks/${encodeURIComponent(bookmarkId)}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setBookmarkId(null)
        setStatus("Bookmark removed.")
      }
      return
    }
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity_kind: "question",
        entity_id: detail.question.id,
        firm_ids: [],
        tags: [],
      }),
    })
    if (response.status === 401) {
      setStatus("Sign in to bookmark questions.")
      return
    }
    if (!response.ok) {
      setStatus(`Bookmark could not be saved (${response.status}).`)
      return
    }
    const payload = (await response.json()) as {
      items?: Array<{ id: string; entity_kind: string; entity_id: string }>
    }
    const saved = payload.items?.find(
      (item) => item.entity_kind === "question" && item.entity_id === detail.question.id,
    )
    setBookmarkId(saved?.id ?? null)
    setStatus("Bookmarked — find it under Saved.")
  }

  async function addToCollection() {
    if (!detail || !collectionId) return
    const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity_kind: "question", entity_id: detail.question.id }),
    })
    if (!response.ok) {
      setStatus(`Could not add to collection (${response.status}).`)
      return
    }
    const payload = (await response.json()) as { items?: typeof collections }
    setCollections(payload.items ?? [])
    const title = payload.items?.find((item) => item.id === collectionId)?.title
    setStatus(`Added to ${title ?? "collection"}.`)
  }

  const inSelectedCollection = Boolean(
    detail &&
      collections
        .find((collection) => collection.id === collectionId)
        ?.items.some(
          (item) => item.entity_kind === "question" && item.entity_id === detail.question.id,
        ),
  )

  function nextQuestion(delta: 1 | -1) {
    if (queue.length === 0) return
    const next = (index + delta + queue.length) % queue.length
    setIndex(next)
    void loadQuestion(queue[next]!)
  }

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      // Leave browser shortcuts (⌘R, ⌘1, Ctrl+B …) alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return
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
        if (event.shiftKey) {
          nextQuestion(-1)
        } else {
          setRevealed((value) => Math.max(0, value - 1))
        }
      }
      if (event.key === "b") {
        event.preventDefault()
        void toggleBookmark()
      }
      if (event.key === "e") {
        event.preventDefault()
        setNoteOpen(true)
      }
      const ratingKey = Number(event.key)
      if (!submitted && ratingKey >= 1 && ratingKey <= RATINGS.length) {
        event.preventDefault()
        setConfidence(RATINGS[ratingKey - 1]!.confidence)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const topic = detail?.question.topic ?? null
  const hintText = topic
    ? `Structure cue: define ${topicLabel(topic)}, state the moving pieces, then apply the relationship. Warren watch-out: ${pitfallForTopic(topic)}`
    : "Structure cue: define the terms in the prompt, give the answer path first, then support it with assumptions. Do not reveal details you have not reasoned through."

  // Peek rail heat context for this question's topic at the primary target.
  React.useEffect(() => {
    if (!topic || !firstTarget) {
      window.queueMicrotask(() => setPeekHeat([]))
      return
    }
    const controller = new AbortController()
    fetch(`/api/prep/heat?firm_id=${encodeURIComponent(firstTarget)}`, {
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              topics?: Array<{ topic_id: string; intensity: number; sample_size: number }>
            })
          : { topics: [] },
      )
      .then((payload) => {
        setPeekHeat(
          (payload.topics ?? [])
            .filter((row) => row.topic_id === topic)
            .map((row) => ({
              topic: row.topic_id,
              intensity: row.intensity,
              sampleSize: row.sample_size,
            })),
        )
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [topic, firstTarget])

  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`
  const sessionComplete = revealed === layers.length && layers.length > 0

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
          <MetadataPill>p layer back</MetadataPill>
          <MetadataPill>Shift+p prev q</MetadataPill>
          <MetadataPill>b bookmark</MetadataPill>
          <MetadataPill>e note</MetadataPill>
          <MetadataPill>1–4 rate</MetadataPill>
        </div>
      </div>

      <article className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-6">
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          {detail?.question.canonical_wording ?? status}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {topic ? <MetadataPill>{topicLabel(topic)}</MetadataPill> : null}
          {topic && weakTopicSet.has(topic) ? (
            <SemanticPill tone="weak">weak for you</SemanticPill>
          ) : null}
          {detail?.question.difficulty ? (
            <MetadataPill>{detail.question.difficulty}</MetadataPill>
          ) : null}
          <MetadataPill>{detail?.source ?? "loading"}</MetadataPill>
          {detail?.study?.validation?.provenance_type ? (
            <ProvenanceChip provenance={detail.study.validation.provenance_type} />
          ) : null}
          {reviewMode ? (
            <SemanticPill tone="milestone">
              Review {index + 1}/{queue.length}
            </SemanticPill>
          ) : null}
          {bookmarked ? <SemanticPill tone="milestone">Bookmarked</SemanticPill> : null}
          {noteSaved ? <SemanticPill tone="success">Note saved</SemanticPill> : null}
          {!submitted && detail ? (
            <span
              className="font-mono text-[11px] tracking-wide text-muted-foreground"
              aria-label="Thinking time"
            >
              thinking {elapsedLabel}
            </span>
          ) : null}
        </div>

        {detail?.bank_signals.length ? (
          <WarrenCallout mood="idle" bracket size={44}>
            Seen in reported interviews at{" "}
            {detail.bank_signals.map((signal) => signal.company).join(", ")} — occurrence context
            only; the teaching answer below comes from the corpus.
          </WarrenCallout>
        ) : null}

        {detail && !submitted ? (
          <div className="space-y-2">
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              aria-expanded={hintOpen}
              onClick={() => setHintOpen((open) => !open)}
            >
              {hintOpen ? "Hide structure hint" : "Show structure hint"}
            </button>
            {hintOpen ? (
              <NotionCallout>
                <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Hint before reveal
                </p>
                <p className="mt-1 text-sm leading-relaxed">{hintText}</p>
              </NotionCallout>
            ) : null}
          </div>
        ) : null}

        <PaperSheet seedKey={`study-${detail?.question.id ?? "loading"}`}>
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
          {voiceEnabled && detail && !submitted ? (
            <VoiceAnswer
              className="mt-2"
              onTranscript={(transcript, spoken) => {
                setAnswer((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript))
                setDelivery(spoken)
              }}
            />
          ) : null}
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <fieldset className="min-w-64 flex-1">
              <legend className="text-xs font-medium text-muted-foreground">
                Self-rating · {Math.round(confidence * 100)}%
              </legend>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Self-rating">
                {RATINGS.map((rating) => (
                  <button
                    key={rating.label}
                    type="button"
                    aria-pressed={confidence === rating.confidence}
                    className={cn(
                      "rounded-full border border-border bg-paper px-1 py-0.5 transition-colors",
                      confidence === rating.confidence
                        ? "border-ink"
                        : "hover:border-ink/50",
                    )}
                    onClick={() => setConfidence(rating.confidence)}
                  >
                    <SemanticPill tone={rating.tone} icon={confidence === rating.confidence}>
                      {rating.label}
                    </SemanticPill>
                  </button>
                ))}
              </div>
            </fieldset>
            <Button
              disabled={!answer.trim() || layers.length === 0 || submitted}
              onClick={() => void submitAttempt()}
            >
              <RoughHover padding={3}>
                {submitted ? (sessionId ? "Attempt saved" : "Revealed anonymously") : sessionId ? "Submit and reveal" : "Reveal anonymously"}
              </RoughHover>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{RATING_GUIDE}</p>
          <div className="mt-3 border-t border-border/70 pt-3">
            {noteOpen ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="study-note">
                  Note — your own wording (Warren prompts, you write)
                </label>
                <textarea
                  id="study-note"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  className="min-h-20 w-full border border-border bg-transparent p-2.5 text-sm leading-relaxed outline-none focus:border-foreground"
                  placeholder="How would you say this in an interview?"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!noteBody.trim()} onClick={() => void saveNote()}>
                    Save note
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setNoteOpen(true)}
              >
                Capture your own wording →
              </button>
            )}
          </div>
        </PaperSheet>

        <div className="flex items-center gap-3">
          <Warren mood={typing ? "paused" : "idle"} userFocused={typing} size={40} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {status}
          </p>
        </div>

        <div aria-live="polite">
          {grade ? (
            <GradeFeedbackCard
              grade={grade}
              activity={activity}
              onSubmitFollowUp={sessionId ? submitFollowUp : undefined}
            />
          ) : null}
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

        <InkHoverScope className="flex flex-wrap gap-2" selector="button:not(:disabled),a[href]">
          <Button
            type="button"
            variant="outline"
            disabled={revealed === 0}
            onClick={() => setRevealed((value) => Math.max(0, value - 1))}
          >
            Previous layer
          </Button>
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
          <Button
            type="button"
            variant="ghost"
            aria-pressed={bookmarked}
            disabled={!detail}
            onClick={() => void toggleBookmark()}
          >
            {bookmarked ? "Remove bookmark" : "Bookmark"}
          </Button>
          {collections.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <select
                aria-label="Collection"
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
                className="h-9 max-w-44 border border-border bg-transparent px-2 text-sm"
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                disabled={!detail || inSelectedCollection}
                onClick={() => void addToCollection()}
              >
                {inSelectedCollection ? "In collection" : "Add to collection"}
              </Button>
            </span>
          ) : null}
          {topic && firstTarget ? (
            <Link href={`/companies/${firstTarget.replace(/^firm_/, "")}?focus=${topic}`}>
              <Button variant="ghost">
                See how {firstTargetName ?? "your target"} asks this
              </Button>
            </Link>
          ) : null}
        </InkHoverScope>

        {sessionComplete ? (
          <PaperSheet seedKey={`study-close-${detail?.question.id}`}>
            <div className="flex flex-wrap items-center gap-5">
              <PaperBurst play seedKey={`burst-${detail?.question.id}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Session close</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {attemptCount > 0
                    ? `${attemptCount} attempt${attemptCount === 1 ? "" : "s"} saved this session — mastery updated, next pack re-ranked.`
                    : "All validated layers reviewed."}{" "}
                  Next: the {topic ? topicLabel(topic) : "concept"} checkpoint in your module
                  roadmap.
                </p>
                <InkHoverScope className="mt-3 flex flex-wrap gap-2" selector="button:not(:disabled),a[href]">
                  {topic ? (
                    <Link href={`/study?topic=${encodeURIComponent(topic)}`}>
                      <Button size="sm">
                        Practise more on this weak topic
                      </Button>
                    </Link>
                  ) : null}
                  {topic && firstTarget ? (
                    <Link href={`/companies/${firstTarget.replace(/^firm_/, "")}?focus=${topic}`}>
                      <Button size="sm" variant="outline">
                        See how {firstTargetName ?? "your target"} asks this
                      </Button>
                    </Link>
                  ) : null}
                  <Link href="/learn">
                    <Button size="sm" variant={topic ? "outline" : "default"}>Next module checkpoint</Button>
                  </Link>
                  <Link href="/progress">
                    <Button size="sm" variant="outline">
                      See progress
                    </Button>
                  </Link>
                </InkHoverScope>
              </div>
              <Warren mood="celebrating" size={56} />
            </div>
          </PaperSheet>
        ) : null}
        </div>

        <aside className="space-y-5 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Mid-session peek
          </p>
          {detail?.study?.diagram_asset ? (
            <DiagramIsland
              title={detail.study.diagram_asset.title}
              source={detail.study.diagram_asset.body}
              a11yFallback={detail.study.diagram_asset.a11y_fallback ?? detail.study.diagram_asset.title}
            />
          ) : (
            <p className="text-xs text-muted-foreground">No diagram for this topic.</p>
          )}
          {peekHeat.length > 0 ? (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                Heat context · your target
              </p>
              <HeatStrip compact entries={peekHeat} />
            </div>
          ) : null}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-mono text-[10px] tracking-wide uppercase">Why this question</p>
            <p>
              {[
                topic ? `${topicLabel(topic)} topic` : null,
                topic && weakTopicSet.has(topic) ? "in your weak set" : null,
                detail?.question.difficulty ? `${detail.question.difficulty} difficulty` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Adaptive selection"}
            </p>
          </div>
        </aside>
      </article>
    </div>
  )
}
