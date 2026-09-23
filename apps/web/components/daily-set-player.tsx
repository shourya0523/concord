"use client"

/**
 * In-page daily-set player (plan 2026-09-23-001 P4.3 / P4.4): walks today's
 * frozen set card by card. Question cards submit to the existing attempts API
 * through one practice session (mode adaptive_weak, the set's question ids);
 * the grade renders with <GradeFeedbackCard/>, then the card is marked done
 * via POST /api/daily-set. Drill cards render <DrillCard/>.
 */
import * as React from "react"
import type { ActivityResult } from "@ibpe/contracts"
import { Button } from "@ibpe/ui/components/button"
import { cn } from "@ibpe/ui/lib/utils"

import { DrillCard } from "@/components/drill-card"
import { GradeFeedbackCard } from "@/components/grade-feedback-card"
import { PaperBurst, PaperSheet, SemanticPill, WarrenCallout } from "@/components/paper"
import type {
  DailySet,
  DailySetActionResponse,
  DailySetItem,
} from "@/lib/api/retention-schemas"
import type { AttemptResponse } from "@/lib/api/schemas"
import type { DrillAttemptResponse } from "@/lib/api/drill-schemas"
import { topicLabel } from "@/lib/topics"

const KIND_LABEL: Record<DailySetItem["kind"], string> = {
  review: "Review",
  new: "New",
  firm_heat: "Firm heat",
  drill: "Numeric drill",
}

const KIND_TONE = {
  review: "milestone",
  new: "neutral",
  firm_heat: "streak",
  drill: "success",
} as const

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

/** Create a practice session for a list of question ids (adaptive_weak). */
export async function startPracticeSession(questionIds: string[], firmIds: string[] = []): Promise<string> {
  const payload = await postJson<{ session: { id: string } }>("/api/practice/sessions", {
    mode: "adaptive_weak",
    question_ids: questionIds,
    firm_ids: firmIds,
    limit: Math.min(50, Math.max(1, questionIds.length)),
  })
  return payload.session.id
}

/** One typed-answer card → attempts API → grade. Shared with the placement check. */
export function AnswerCard({
  sessionId,
  questionId,
  prompt,
  header,
  onGraded,
  onSkip,
  submitLabel = "Submit answer",
}: {
  sessionId: string | null
  questionId: string
  prompt: string
  header?: React.ReactNode
  onGraded: (result: AttemptResponse) => void | Promise<void>
  onSkip?: () => void
  submitLabel?: string
}) {
  const [answer, setAnswer] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [typing, setTyping] = React.useState(false)
  const startedAt = React.useRef<number>(0)

  // Call sites key this card by question, so state resets on remount.
  React.useEffect(() => {
    startedAt.current = Date.now()
  }, [questionId])

  async function submit() {
    if (!sessionId || !answer.trim()) return
    setPending(true)
    setError(null)
    try {
      const result = await postJson<AttemptResponse>(
        `/api/practice/sessions/${encodeURIComponent(sessionId)}/attempts`,
        {
          canonical_question_id: questionId,
          response_text: answer.trim().slice(0, 4000),
          time_spent_ms: Math.max(0, Date.now() - startedAt.current),
        },
      )
      await onGraded(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade this answer")
    } finally {
      setPending(false)
    }
  }

  return (
    <PaperSheet seedKey={`answer-${questionId}`}>
      {header}
      <p className="mt-2 font-display text-2xl leading-snug tracking-tight">{prompt}</p>
      <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor={`answer-${questionId}`}>
        Your answer — type it as you would say it
      </label>
      <textarea
        id={`answer-${questionId}`}
        value={answer}
        maxLength={4000}
        onChange={(event) => setAnswer(event.target.value)}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        className="mt-2 min-h-32 w-full border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground"
        placeholder="Lead with the answer, then the why…"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-error-foreground">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending || !answer.trim() || !sessionId} onClick={() => void submit()}>
          {pending ? "Grading…" : submitLabel}
        </Button>
        {onSkip ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={onSkip}
            disabled={pending}
          >
            Skip for now
          </button>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {typing ? "" : pending ? "Grading your answer" : ""}
        </span>
      </div>
    </PaperSheet>
  )
}

function ActivityStrip({ activity }: { activity: ActivityResult | null | undefined }) {
  if (!activity) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      {activity.xp_awarded > 0 ? <SemanticPill tone="milestone">+{activity.xp_awarded} XP</SemanticPill> : null}
      {activity.streak?.goal_met_today ? (
        <SemanticPill tone="streak">{activity.streak.current}-day streak</SemanticPill>
      ) : null}
      {activity.achievements_earned.map((achievement) => (
        <SemanticPill key={achievement.id} tone="success">
          {achievement.title}
        </SemanticPill>
      ))}
    </div>
  )
}

export function DailySetPlayer({
  set: initialSet,
  firmIds = [],
  onProgress,
  onClose,
}: {
  set: DailySet
  firmIds?: string[]
  onProgress?: (set: DailySet, activity: ActivityResult | null) => void
  onClose?: () => void
}) {
  const [set, setSet] = React.useState<DailySet>(initialSet)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [sessionError, setSessionError] = React.useState<string | null>(null)
  const [skipped, setSkipped] = React.useState<string[]>([])
  const [graded, setGraded] = React.useState<{
    itemId: string
    grade: AttemptResponse["grade"] | null
    drill: DrillAttemptResponse | null
    activity: ActivityResult | null
  } | null>(null)
  const [marking, setMarking] = React.useState(false)
  const [markError, setMarkError] = React.useState<string | null>(null)

  // The set's composition is frozen for the day, so one session per player.
  const [sessionRequest] = React.useState(() => ({
    questionIds: initialSet.items
      .map((item) => item.question_id)
      .filter((id): id is string => Boolean(id)),
    firmIds: firmIds.slice(0, 1),
  }))

  React.useEffect(() => {
    if (sessionRequest.questionIds.length === 0) return
    let cancelled = false
    startPracticeSession(sessionRequest.questionIds, sessionRequest.firmIds)
      .then((id) => {
        if (!cancelled) setSessionId(id)
      })
      .catch((err: unknown) => {
        if (!cancelled) setSessionError(err instanceof Error ? err.message : "Could not start the set")
      })
    return () => {
      cancelled = true
    }
  }, [sessionRequest])

  const open = set.items.filter((item) => !item.done_at)
  const queue = [...open.filter((item) => !skipped.includes(item.id)), ...open.filter((item) => skipped.includes(item.id))]
  const current = graded ? set.items.find((item) => item.id === graded.itemId) ?? null : (queue[0] ?? null)
  const doneCount = set.items.filter((item) => item.done_at).length
  const allDone = set.items.length > 0 && doneCount >= set.items.length

  async function markDone(item: DailySetItem, activityFromAttempt: ActivityResult | null | undefined) {
    setMarking(true)
    setMarkError(null)
    try {
      const result = await postJson<DailySetActionResponse>("/api/daily-set", {
        action: "complete",
        item_id: item.id,
      })
      setSet(result.set)
      const activity = activityFromAttempt ?? result.activity
      onProgress?.(result.set, activity ?? null)
      return activity ?? null
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Could not update today's set")
      return activityFromAttempt ?? null
    } finally {
      setMarking(false)
    }
  }

  async function handleAttempt(item: DailySetItem, result: AttemptResponse) {
    setGraded({ itemId: item.id, grade: result.grade ?? null, drill: null, activity: result.activity ?? null })
    const activity = await markDone(item, result.activity)
    setGraded({ itemId: item.id, grade: result.grade ?? null, drill: null, activity })
  }

  async function handleDrill(item: DailySetItem, result: DrillAttemptResponse) {
    setGraded({ itemId: item.id, grade: null, drill: result, activity: result.activity ?? null })
    const activity = await markDone(item, result.activity)
    setGraded({ itemId: item.id, grade: null, drill: result, activity })
  }

  function next() {
    setGraded(null)
    setMarkError(null)
  }

  function skip(item: DailySetItem) {
    setSkipped((prev) => [...prev.filter((id) => id !== item.id), item.id])
  }

  const header = (item: DailySetItem, position: number) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Card {position} of {set.items.length}
      </span>
      <SemanticPill tone={KIND_TONE[item.kind]} icon={false}>
        {KIND_LABEL[item.kind]}
      </SemanticPill>
      {item.topic ? (
        <span className="text-xs text-muted-foreground">{topicLabel(item.topic)}</span>
      ) : null}
      <span className="w-full text-xs text-muted-foreground">{item.reason}</span>
    </div>
  )

  return (
    <section aria-label="Today's set" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Today&apos;s set · {doneCount}/{set.items.length} done
          </p>
          <div
            className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full border border-border bg-background"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={set.items.length}
            aria-valuenow={doneCount}
            aria-label="Daily set progress"
          >
            <div
              className="h-full bg-streak transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${set.items.length ? (doneCount / set.items.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>

      {sessionError ? (
        <p role="alert" className="border border-dashed border-error px-3 py-2 text-sm">
          {sessionError}
        </p>
      ) : null}

      {allDone && !graded ? (
        <div className="relative space-y-3 border border-ink/20 bg-streak/10 px-4 py-5">
          <PaperBurst play seedKey={`set-done-${set.local_date}`} className="pointer-events-none absolute inset-x-0 top-0 mx-auto" />
          <WarrenCallout mood="celebrating" bracket>
            Set complete — {set.items.length} cards graded today. Anything more is a bonus.
          </WarrenCallout>
          {onClose ? (
            <Button type="button" onClick={onClose}>
              Back to Today
            </Button>
          ) : null}
        </div>
      ) : current ? (
        <div className="space-y-4">
          {graded ? (
            <div className="space-y-3">
              {header(current, set.items.findIndex((item) => item.id === current.id) + 1)}
              <p className="font-display text-xl leading-snug tracking-tight">{current.prompt}</p>
              {graded.grade ? <GradeFeedbackCard grade={graded.grade} /> : null}
              {graded.drill ? (
                <section className="space-y-1 rounded-md border border-border bg-card p-4 text-sm" aria-label="Drill result">
                  <SemanticPill tone={graded.drill.correct ? "success" : "error"}>
                    {graded.drill.correct ? "Correct" : "Not quite"}
                  </SemanticPill>
                  <p>{graded.drill.solution.explanation}</p>
                </section>
              ) : null}
              <ActivityStrip activity={graded.activity} />
              {markError ? (
                <p role="alert" className="text-sm text-error-foreground">
                  {markError}
                </p>
              ) : null}
              <Button type="button" disabled={marking} onClick={next}>
                {marking ? "Saving…" : doneCount >= set.items.length ? "Finish set" : "Next card"}
              </Button>
            </div>
          ) : current.kind === "drill" && current.drill ? (
            <div className="space-y-3">
              {header(current, set.items.findIndex((item) => item.id === current.id) + 1)}
              <DrillCard drill={current.drill} onGraded={(result) => void handleDrill(current, result)} />
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => skip(current)}
              >
                Skip for now
              </button>
            </div>
          ) : current.question_id ? (
            <AnswerCard
              key={current.id}
              sessionId={sessionId}
              questionId={current.question_id}
              prompt={current.prompt}
              header={header(current, set.items.findIndex((item) => item.id === current.id) + 1)}
              onGraded={(result) => handleAttempt(current, result)}
              onSkip={queue.length > 1 ? () => skip(current) : undefined}
            />
          ) : null}
        </div>
      ) : (
        <p className={cn("text-sm text-muted-foreground")}>
          No cards in today&apos;s set yet — answer anything in Study to count toward your goal.
        </p>
      )}
    </section>
  )
}
