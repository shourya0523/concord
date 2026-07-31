"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { InterviewerAvatar } from "@/components/mockups/interviewer-avatar"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { TargetSelectIsland, readStoredTargets } from "@/components/target-select-island"

type Session = {
  id: string
  question_ids: string[]
  metadata?: {
    simulator?: {
      stage_template?: {
        ib?: Array<{ id: string; label: string; minutes: number }>
        pe?: Array<{ id: string; label: string; minutes: number }>
      }
    }
  }
}

type QuestionDetail = {
  question: { id: string; canonical_wording: string; topic?: string | null }
  study?: { direct_answer?: string | null }
}

export function SimulatorIsland() {
  const [targets, setTargets] = React.useState<string[]>([])
  const [session, setSession] = React.useState<Session | null>(null)
  const [question, setQuestion] = React.useState<QuestionDetail | null>(null)
  const [answer, setAnswer] = React.useState("")
  const [rating, setRating] = React.useState<boolean | null>(null)
  const [status, setStatus] = React.useState("Choose a firm set to start.")
  const [typing, setTyping] = React.useState(false)
  const startedAt = React.useRef(0)

  React.useEffect(() => setTargets(readStoredTargets()), [])

  async function start() {
    if (targets.length === 0) return
    setStatus("Building a firm-templated session…")
    const sessionResponse = await fetch("/api/practice/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "simulator",
        learning_mode: "company_prep",
        firm_ids: targets,
        concept_ids: [],
        question_ids: [],
        limit: 5,
      }),
    })
    if (!sessionResponse.ok) {
      setStatus(`Simulator session failed (${sessionResponse.status}).`)
      return
    }
    const payload = (await sessionResponse.json()) as { session: Session; source: string }
    setSession(payload.session)
    const questionId = payload.session.question_ids[0]
    if (!questionId) {
      setStatus("No published questions are available for the simulator.")
      return
    }
    const questionResponse = await fetch(
      `/api/questions/${encodeURIComponent(questionId)}?view=study`,
    )
    if (!questionResponse.ok) {
      setStatus(`Question load failed (${questionResponse.status}).`)
      return
    }
    setQuestion((await questionResponse.json()) as QuestionDetail)
    setAnswer("")
    setRating(null)
    startedAt.current = Date.now()
    setStatus(`Session ${payload.session.id} started from ${payload.source}.`)
  }

  async function saveRating(correct: boolean) {
    if (!session || !question) return
    setStatus("Saving transcript and self-rating…")
    const response = await fetch(`/api/practice/sessions/${session.id}/attempts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canonical_question_id: question.question.id,
        response_text: answer,
        confidence: correct ? 0.75 : 0.35,
        correct,
        time_spent_ms: Date.now() - startedAt.current,
      }),
    })
    if (!response.ok) {
      setStatus(`Attempt save failed (${response.status}).`)
      return
    }
    const payload = (await response.json()) as {
      mastery?: { score?: number }
      source: string
    }
    setRating(correct)
    setStatus(
      `Attempt saved to ${payload.source}; mastery ${Math.round((payload.mastery?.score ?? 0) * 100)}%.`,
    )
  }

  const stages =
    session?.metadata?.simulator?.stage_template?.ib ??
    session?.metadata?.simulator?.stage_template?.pe ??
    []

  return (
    <div className="space-y-6">
      {!session ? (
        <>
          <TargetSelectIsland value={targets} onChange={setTargets} />
          <Button disabled={targets.length === 0} onClick={() => void start()}>
            Start firm mock
          </Button>
        </>
      ) : null}

      {session && question && rating === null ? (
        <>
          <div className="flex flex-wrap gap-2">
            {stages.map((stage, index) => (
              <MetadataPill key={stage.id} tone={index === 0 ? "lime" : "default"}>
                {stage.label} · {stage.minutes}m
              </MetadataPill>
            ))}
          </div>
          <InterviewerAvatar
            interviewerId={targets[0] === "firm_kkr" ? "alex-pe-kkr" : "morgan-vp-gs"}
            state={typing ? "listening" : answer ? "evaluating" : "speaking"}
          />
          <PaperSheet seedKey={`sim-${session.id}`} torn={false}>
            <p className="text-xl font-medium leading-snug">{question.question.canonical_wording}</p>
            <textarea
              className="mt-4 min-h-40 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground"
              value={answer}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Structure your spoken answer here…"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={!answer.trim()} onClick={() => void saveRating(true)}>
                Solid answer
              </Button>
              <Button
                disabled={!answer.trim()}
                variant="outline"
                onClick={() => void saveRating(false)}
              >
                Needs work
              </Button>
            </div>
          </PaperSheet>
        </>
      ) : null}

      {rating !== null ? (
        <PaperSheet seedKey={`sim-score-${session?.id ?? "complete"}`} hero>
          <HandwritingHeadline phrase="Great work!" play />
          <p className="mt-4 text-4xl font-semibold">
            {rating ? "Solid" : "Needs work"}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            This is your confirmed self-rating, persisted through the practice-attempt API. Concord
            does not fabricate an AI score.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/learn">
              <Button>Recommended modules</Button>
            </Link>
            <Button variant="outline" onClick={() => void start()}>
              New mock
            </Button>
          </div>
        </PaperSheet>
      ) : null}

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  )
}
