"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import {
  Annotate,
  CircledNumber,
  InterviewerAvatar,
  PaperSheet,
  SemanticPill,
  Warren,
  type InterviewerId,
  type InterviewerState,
} from "@/components/paper"
import { fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import { topicLabel } from "@/lib/topics"

/**
 * Interview simulator (DESIGN.md §10.11) — firm-templated mock.
 * Self-ratings map Again/Hard/Good/Easy → confidence 0.25/0.5/0.75/1; the
 * attempt POST is the confirmed result, so the score reveal (and Warren's
 * celebration) only render after the last attempt save succeeds.
 */

type StageTemplate = { id: string; label: string; minutes: number }

const STAGE_TEMPLATES: Record<"ib" | "pe", StageTemplate[]> = {
  ib: [
    { id: "ib_fit", label: "Fit / motivation", minutes: 8 },
    { id: "ib_accounting", label: "Accounting technicals", minutes: 12 },
    { id: "ib_valuation", label: "Valuation & DCF", minutes: 15 },
    { id: "ib_deal_judgement", label: "Market / deal judgement", minutes: 10 },
  ],
  pe: [
    { id: "pe_fit", label: "Investing fit", minutes: 8 },
    { id: "pe_lbo", label: "LBO & returns", minutes: 15 },
    { id: "pe_ic", label: "IC judgement", minutes: 12 },
    { id: "pe_portfolio", label: "Portfolio operations", minutes: 10 },
  ],
}

/** Stage → concept lab for the after-action recommendations. */
const STAGE_CONCEPT: Record<string, { slug: string; title: string }> = {
  ib_fit: { slug: "behavioural-story", title: "Behavioural story" },
  ib_accounting: { slug: "accounting-foundations", title: "Accounting foundations" },
  ib_valuation: { slug: "dcf-wacc", title: "DCF & WACC" },
  pe_fit: { slug: "behavioural-story", title: "Behavioural story" },
  pe_lbo: { slug: "lbo-paper-lbo", title: "Paper LBO" },
}

const RATINGS = [
  { label: "Again", confidence: 0.25 },
  { label: "Hard", confidence: 0.5 },
  { label: "Good", confidence: 0.75 },
  { label: "Easy", confidence: 1 },
] as const

const PASS_CONFIDENCE = 0.75

type FirmOption = { id: string; name: string; track?: string }

type SessionPayload = {
  session: { id: string; question_ids: string[] }
  source: string
  note?: string
}

type QuestionPayload = {
  question: { id: string; canonical_wording: string; topic?: string | null }
}

type StageResult = {
  stage: StageTemplate
  confidence: number
  correct: boolean
  questionTopic: string | null
}

type Phase = "setup" | "starting" | "running" | "reveal"

/** Deterministic fixed-cast mapping (DESIGN.md §6 — same firm, same face). */
function interviewerForFirm(firmName: string): InterviewerId {
  const name = firmName.toLowerCase()
  if (
    /(kkr|blackstone|carlyle|apollo|tpg|advent|permira|cvc|bain capital|eqt|vista|thoma bravo|silver lake|warburg)/.test(
      name,
    )
  ) {
    return "alex-pe-kkr"
  }
  if (/(jpmorgan|jp morgan|j\.p\. morgan|jpm)/.test(name)) {
    return "jordan-analyst-jpm"
  }
  return "morgan-vp-gs"
}

function trackKeyForFirm(firm: FirmOption | undefined): "ib" | "pe" {
  return firm?.track?.toLowerCase().includes("pe") ? "pe" : "ib"
}

export function SimulatorIsland() {
  const [phase, setPhase] = React.useState<Phase>("setup")
  const [firms, setFirms] = React.useState<FirmOption[]>([])
  const [firmId, setFirmId] = React.useState<string>("")
  const [role, setRole] = React.useState<"Analyst" | "Associate">("Analyst")
  const [session, setSession] = React.useState<SessionPayload["session"] | null>(null)
  const [stageIndex, setStageIndex] = React.useState(0)
  const [question, setQuestion] = React.useState<QuestionPayload["question"] | null>(null)
  const [questionLoading, setQuestionLoading] = React.useState(false)
  const [answer, setAnswer] = React.useState("")
  const [typing, setTyping] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [results, setResults] = React.useState<StageResult[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const startedAt = React.useRef(0)

  React.useEffect(() => {
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (cancelled) return
      setFirms(options)
      const stored = readStoredTargets()
      const first = stored[0]
      if (first && options.some((firm) => firm.id === first)) {
        setFirmId(first)
      } else if (options[0]) {
        setFirmId(options[0].id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const firm = firms.find((option) => option.id === firmId)
  const trackKey = trackKeyForFirm(firm)
  const stages = STAGE_TEMPLATES[trackKey]
  const interviewerId = interviewerForFirm(firm?.name ?? "")

  const loadStageQuestion = React.useCallback(
    async (sessionData: SessionPayload["session"], index: number) => {
      const ids = sessionData.question_ids
      const questionId = ids[index % ids.length]
      if (!questionId) {
        setError("The session returned no questions.")
        return
      }
      setQuestionLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/questions/${encodeURIComponent(questionId)}?view=study`,
        )
        if (!response.ok) {
          setError(`The stage question didn't load (HTTP ${response.status}).`)
          return
        }
        const payload = (await response.json()) as QuestionPayload
        setQuestion(payload.question)
        setAnswer("")
        startedAt.current = Date.now()
      } catch {
        setError("The stage question didn't load — the network request failed.")
      } finally {
        setQuestionLoading(false)
      }
    },
    [],
  )

  async function start() {
    if (!firmId || phase === "starting") return
    setPhase("starting")
    setError(null)
    setResults([])
    setStageIndex(0)
    try {
      const response = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "simulator",
          learning_mode: "company_prep",
          firm_ids: [firmId],
          concept_ids: [],
          question_ids: [],
          limit: stages.length,
        }),
      })
      if (response.status === 401) {
        setError("Sign in to run a firm mock — sessions save to your account.")
        setPhase("setup")
        return
      }
      if (!response.ok) {
        setError(`The simulator session failed to start (HTTP ${response.status}).`)
        setPhase("setup")
        return
      }
      const payload = (await response.json()) as SessionPayload
      if (payload.session.question_ids.length === 0) {
        setError("No published questions are available for a mock right now.")
        setPhase("setup")
        return
      }
      setSession(payload.session)
      setPhase("running")
      await loadStageQuestion(payload.session, 0)
    } catch {
      setError("The simulator session failed to start — the network request failed.")
      setPhase("setup")
    }
  }

  async function submitRating(confidence: number) {
    if (!session || !question || submitting) return
    const stage = stages[stageIndex]
    if (!stage) return
    setSubmitting(true)
    setError(null)
    const correct = confidence >= PASS_CONFIDENCE
    try {
      const response = await fetch(`/api/practice/sessions/${session.id}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canonical_question_id: question.id,
          response_text: answer,
          confidence,
          correct,
          time_spent_ms: Date.now() - startedAt.current,
        }),
      })
      if (!response.ok) {
        setError(
          `The rating didn't save (HTTP ${response.status}). Your answer is still here — try again.`,
        )
        return
      }
      const nextResults = [
        ...results,
        { stage, confidence, correct, questionTopic: question.topic ?? null },
      ]
      setResults(nextResults)
      if (stageIndex + 1 >= stages.length) {
        // Confirmed final attempt — only now may the score reveal render.
        setPhase("reveal")
        return
      }
      const nextIndex = stageIndex + 1
      setStageIndex(nextIndex)
      await loadStageQuestion(session, nextIndex)
    } catch {
      setError("The rating didn't save — the network request failed. Your answer is still here.")
    } finally {
      setSubmitting(false)
    }
  }

  function resetToSetup() {
    setPhase("setup")
    setSession(null)
    setQuestion(null)
    setStageIndex(0)
    setResults([])
    setAnswer("")
    setError(null)
  }

  const interviewerState: InterviewerState = submitting
    ? "evaluating"
    : questionLoading
      ? "evaluating"
      : typing
        ? "listening"
        : "speaking"

  const stage = stages[stageIndex]

  if (phase === "reveal") {
    const passed = results.filter((result) => result.correct).length
    const overall = results.length > 0 ? Math.round((passed / results.length) * 100) : 0
    const weakStages = results.filter((result) => !result.correct)
    const conceptLinks = new Map(
      weakStages.flatMap((result) => {
        const concept = STAGE_CONCEPT[result.stage.id]
        return concept ? [[concept.slug, concept] as const] : []
      }),
    )
    return (
      <div className="space-y-6">
        <PaperSheet seedKey={`sim-reveal-${session?.id ?? "done"}`} hero>
          <div className="flex flex-wrap items-start gap-6">
            <CircledNumber value={`${overall}%`} label="self-rated readiness" size="lg" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                {firm?.name ?? "Firm"} mock · {role} · {trackKey.toUpperCase()} template
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {passed} of {results.length} stages rated Good or better. This is your confirmed
                self-rating, persisted through the practice-attempt API — Concord does not
                fabricate an AI score.
              </p>
              <ul className="space-y-1.5">
                {results.map((result) => (
                  <li key={result.stage.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {result.stage.label} · {result.stage.minutes}m
                    </span>
                    <SemanticPill tone={result.correct ? "success" : "error"}>
                      {result.correct ? "Solid" : "Needs work"}
                    </SemanticPill>
                  </li>
                ))}
              </ul>
            </div>
            <Warren mood="celebrating" size={64} />
          </div>
        </PaperSheet>

        <section className="space-y-3">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Recommended next
          </h2>
          {weakStages.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {[...conceptLinks.values()].map((concept) => (
                <li key={concept.slug}>
                  <Link
                    href={`/concepts/${concept.slug}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {concept.title} lab →
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    for your weaker {weakStages
                      .filter((result) => STAGE_CONCEPT[result.stage.id]?.slug === concept.slug)
                      .map((result) => result.stage.label.toLowerCase())
                      .join(" & ")}{" "}
                    stage
                  </span>
                </li>
              ))}
              <li>
                <Link href="/learn" className="text-foreground underline-offset-4 hover:underline">
                  Learn modules →
                </Link>{" "}
                <span className="text-muted-foreground">prereq-ordered lessons and drills</span>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Every stage landed Good or better — keep cadence with a{" "}
              <Link href="/learn" className="text-foreground underline-offset-4 hover:underline">
                Learn module
              </Link>{" "}
              or a fresh{" "}
              <Link href="/prep/rag" className="text-foreground underline-offset-4 hover:underline">
                session pack
              </Link>
              .
            </p>
          )}
          <div className="pt-2">
            <Button variant="outline" onClick={resetToSetup}>
              Run another mock
            </Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Setup
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Firm</span>
            <select
              value={firmId}
              onChange={(event) => setFirmId(event.target.value)}
              disabled={phase !== "setup"}
              className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-60"
            >
              {firms.length === 0 ? <option value="">Loading firm catalog…</option> : null}
              {firms.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Role</span>
            <div className="flex gap-2" role="group" aria-label="Role">
              {(["Analyst", "Associate"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={role === value}
                  disabled={phase !== "setup"}
                  onClick={() => setRole(value)}
                  className={
                    role === value
                      ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-60"
                      : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-60"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {trackKey === "pe" ? "PE" : "IB"} stage template from {firm?.name ?? "the firm"}&apos;s
          track · deterministic cast — same firm, same interviewer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Stage path
        </h2>
        <ol className="space-y-1">
          {stages.map((item, index) => {
            const state =
              phase === "running" || phase === "starting"
                ? index < stageIndex
                  ? "done"
                  : index === stageIndex
                    ? "current"
                    : "todo"
                : "todo"
            return (
              <li key={item.id} className="relative flex items-center gap-3 py-1.5">
                {index < stages.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-8 bottom-[-0.375rem] left-[0.5625rem] border-l border-dashed border-border"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={
                    state === "done"
                      ? "flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-ink bg-ink"
                      : "flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-ink bg-paper"
                  }
                >
                  {state === "done" ? (
                    <span className="size-1 rounded-full bg-paper" />
                  ) : null}
                </span>
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase">
                  {state === "current" ? (
                    <Annotate type="box" color="var(--ink)" padding={2}>
                      <span className="text-foreground">
                        {item.label} · {item.minutes}m
                      </span>
                    </Annotate>
                  ) : (
                    <span className={state === "done" ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                      {item.label} · {item.minutes}m
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <InterviewerAvatar interviewerId={interviewerId} state={interviewerState} size={64} />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border border-dashed border-error px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">{error}</span>
          {phase === "setup" ? (
            <Button size="sm" variant="outline" onClick={() => void start()}>
              Retry
            </Button>
          ) : null}
          {phase === "running" ? (
            <Button size="sm" variant="ghost" onClick={resetToSetup}>
              Abandon mock
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase === "setup" || phase === "starting" ? (
        <Button disabled={!firmId || phase === "starting"} onClick={() => void start()}>
          {phase === "starting" ? "Briefing your interviewer…" : "Start firm mock"}
        </Button>
      ) : null}

      {phase === "running" ? (
        <PaperSheet seedKey={`sim-stage-${session?.id ?? "run"}-${stageIndex}`} torn={false}>
          {questionLoading ? (
            <p className="text-sm text-muted-foreground">
              Your interviewer is reading the next prompt…
            </p>
          ) : question ? (
            <>
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Stage {stageIndex + 1} of {stages.length}
                {stage ? ` · ${stage.label} · ~${stage.minutes}m` : ""}
                {question.topic ? ` · topic: ${question.topic.replace(/_/g, " ")}` : ""}
              </p>
              <p className="mt-3 text-xl font-medium leading-snug">
                {question.canonical_wording}
              </p>
              <textarea
                className="mt-4 min-h-40 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground"
                value={answer}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Structure your spoken answer here — then rate yourself honestly. A blank that earned an 'Again' is fine too."
                aria-label="Your answer"
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {RATINGS.map((rating) => (
                  <Button
                    key={rating.label}
                    variant={rating.confidence >= PASS_CONFIDENCE ? "default" : "outline"}
                    disabled={submitting}
                    onClick={() => void submitRating(rating.confidence)}
                  >
                    {rating.label}
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {submitting ? "Saving your rating…" : "Good or better counts as solid."}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This stage couldn&apos;t load a question — use the retry above, or abandon the mock.
            </p>
          )}
        </PaperSheet>
      ) : null}
    </div>
  )
}
