"use client"

/**
 * Grade feedback after an attempt (plan 2026-09-23-001 P0.2 / P3.3 / P7.1).
 * Shared by the study page, simulator and the daily-set player. Shows what the
 * grader actually decided: score, source, rubric items with evidence, numeric
 * checks, delivery (voice), the interviewer follow-up and citations. Renders
 * only the fields present — every grader-v2 field is optional.
 *
 * Props are backward compatible: `grade`, `className`, `onFollowUp` keep their
 * original meaning; `activity`, `onSubmitFollowUp`, `title` and `compact` are
 * additive.
 */
import * as React from "react"

import type { ActivityResult } from "@ibpe/contracts"
import type { AttemptGradeResponse } from "@/lib/api/schemas"
import { PaperBurst, SemanticPill } from "@/components/paper"
import { topicLabel } from "@/lib/topics"
import { cn } from "@ibpe/ui/lib/utils"

const SOURCE_LABEL: Record<AttemptGradeResponse["score_source"], string> = {
  llm: "AI-graded against the teaching answer",
  jev: "Graded by Jev against the teaching answer",
  numeric: "Checked numerically",
  deterministic: "Estimated (keyword coverage)",
  self: "Self-rated",
  reveal_copy: "Copied after reveal — not counted",
}

const VERDICT_TONE = {
  hit: "success",
  partial: "streak",
  miss: "error",
} as const

function scoreTone(grade: AttemptGradeResponse) {
  if (grade.score_source === "reveal_copy") return "neutral" as const
  if (grade.score >= 0.7) return "success" as const
  if (grade.score >= 0.45) return "streak" as const
  return "error" as const
}

export function GradeFeedbackCard({
  grade,
  className,
  onFollowUp,
  onSubmitFollowUp,
  activity,
  title,
  compact = false,
}: {
  grade: AttemptGradeResponse
  className?: string
  /** When set, shows a "try the follow-up" action (caller owns the input). */
  onFollowUp?: (followUp: string) => void
  /**
   * When set, the card owns an optional second-attempt box for the
   * interviewer follow-up and renders its grade inline. Resolve null on failure.
   */
  onSubmitFollowUp?: (answer: string, followUp: string) => Promise<AttemptGradeResponse | null>
  /** Streak / XP / achievements returned with this attempt. */
  activity?: ActivityResult | null
  /** Heading shown above the score (e.g. "Follow-up attempt"). */
  title?: string
  /** Hide rubric details — used for nested follow-up grades. */
  compact?: boolean
}) {
  const percent = Math.round(grade.score * 100)
  const tone = scoreTone(grade)
  const items = grade.rubric_items ?? []
  const numeric = grade.numeric_checks ?? []
  const redFlags = grade.red_flags_triggered ?? []
  const weakTopics = grade.weak_topics ?? []
  const citations = grade.citations ?? []
  const idBase = React.useId()

  return (
    <section
      aria-label={title ?? "Grade feedback"}
      className={cn("space-y-3 rounded-md border border-border bg-card p-4", className)}
    >
      {title ? (
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <SemanticPill tone={tone}>{percent}%</SemanticPill>
        {grade.correct === true ? <SemanticPill tone="success">Interview-ready</SemanticPill> : null}
        {grade.correct === false ? (
          <SemanticPill tone="weak" icon={false}>
            Not yet
          </SemanticPill>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {SOURCE_LABEL[grade.score_source] ?? grade.score_source}
          {grade.cached ? " · cached" : ""}
        </span>
      </div>

      {activity ? <ActivityPills activity={activity} seedKey={`${idBase}-activity`} /> : null}

      {grade.feedback ? <p className="text-sm leading-relaxed">{grade.feedback}</p> : null}

      {!compact && items.length > 0 ? (
        <ul className="space-y-2" aria-label="Key points">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-start gap-2">
                <SemanticPill tone={VERDICT_TONE[item.verdict]}>{item.verdict}</SemanticPill>
                <span>
                  {item.text}
                  {item.must_have ? (
                    <span className="ml-1 text-xs text-muted-foreground">(must-have)</span>
                  ) : null}
                </span>
              </div>
              {item.evidence ? (
                <blockquote className="mt-1 ml-2 border-l-2 border-border pl-2 text-xs text-muted-foreground italic">
                  “{item.evidence}”
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && numeric.length > 0 ? (
        <ul className="space-y-1" aria-label="Numeric checks">
          {numeric.map((check) => (
            <li key={check.id} className="flex items-center gap-2 text-sm">
              <SemanticPill tone={check.pass ? "success" : "error"}>
                {check.pass ? "correct" : "off"}
              </SemanticPill>
              <span>
                {check.label}: expected {formatNumber(check.expected)}
                {check.unit ?? ""}
                {check.found == null
                  ? " — no number found"
                  : `, you said ${formatNumber(check.found)}${check.unit ?? ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {redFlags.length > 0 ? (
        <div className="text-sm">
          <SemanticPill tone="weak">Red flag</SemanticPill> <span>{redFlags.join(" · ")}</span>
        </div>
      ) : null}

      {grade.delivery ? <DeliveryRow delivery={grade.delivery} /> : null}

      {weakTopics.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Weak topics: {weakTopics.map((topic) => topicLabel(topic)).join(", ")}
        </p>
      ) : null}

      {grade.follow_up && !compact ? (
        <FollowUpBlock
          followUp={grade.follow_up}
          onFollowUp={onFollowUp}
          onSubmitFollowUp={onSubmitFollowUp}
          idBase={idBase}
        />
      ) : null}

      {citations.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Sources: {citations.map((c) => c.label ?? c.id).join(" · ")}
        </p>
      ) : null}
    </section>
  )
}

function DeliveryRow({ delivery }: { delivery: NonNullable<AttemptGradeResponse["delivery"]> }) {
  const parts = [
    delivery.duration_ms != null ? formatDuration(delivery.duration_ms) : null,
    delivery.words_per_minute != null ? `${Math.round(delivery.words_per_minute)} wpm` : null,
    delivery.filler_count != null
      ? `${delivery.filler_count} filler${delivery.filler_count === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean)
  const score = delivery.score
  return (
    <div className="space-y-1 text-sm" aria-label="Delivery">
      <div className="flex flex-wrap items-center gap-2">
        <SemanticPill
          tone={score == null ? "neutral" : score >= 0.7 ? "success" : score >= 0.45 ? "streak" : "weak"}
          icon={false}
        >
          Delivery {score == null ? "—" : `${Math.round(score * 100)}%`}
        </SemanticPill>
        {parts.length > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">{parts.join(" · ")}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {delivery.note ? `${delivery.note} ` : ""}Coaching only — delivery never changes mastery.
      </p>
    </div>
  )
}

function FollowUpBlock({
  followUp,
  onFollowUp,
  onSubmitFollowUp,
  idBase,
}: {
  followUp: string
  onFollowUp?: (followUp: string) => void
  onSubmitFollowUp?: (answer: string, followUp: string) => Promise<AttemptGradeResponse | null>
  idBase: string
}) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [followUpGrade, setFollowUpGrade] = React.useState<AttemptGradeResponse | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const inputId = `${idBase}-follow-up`

  React.useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  async function submit() {
    if (!onSubmitFollowUp || !text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await onSubmitFollowUp(text.trim(), followUp)
      if (result) {
        setFollowUpGrade(result)
        setOpen(false)
      } else {
        setError("The follow-up didn't save — your answer is still here.")
      }
    } catch {
      setError("The follow-up didn't save — your answer is still here.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md bg-secondary p-3 text-sm">
      <p className="font-medium">The interviewer follows up…</p>
      <p>{followUp}</p>
      {onSubmitFollowUp && !followUpGrade ? (
        open ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
              Your follow-up answer (optional second try — counts once for review scheduling)
            </label>
            <textarea
              id={inputId}
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void submit()
                }
                if (event.key === "Escape") setOpen(false)
              }}
              className="min-h-24 w-full border border-border bg-background p-2.5 text-sm leading-relaxed outline-none focus:border-foreground"
              placeholder="Answer the follow-up in two or three sentences…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!text.trim() || busy}
                className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
              >
                {busy ? "Grading…" : "Submit follow-up"}
              </button>
              <button
                type="button"
                className="text-sm underline underline-offset-4"
                onClick={() => setOpen(false)}
              >
                Skip
              </button>
              <span className="text-xs text-muted-foreground">⌘/Ctrl+Enter to submit</span>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-error-foreground">
                {error}
              </p>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            className="text-sm underline underline-offset-4"
            aria-expanded={false}
            onClick={() => setOpen(true)}
          >
            Answer the follow-up
          </button>
        )
      ) : null}
      {!onSubmitFollowUp && onFollowUp ? (
        <button
          type="button"
          className="text-sm underline underline-offset-4"
          onClick={() => onFollowUp(followUp)}
        >
          Answer the follow-up
        </button>
      ) : null}
      <div aria-live="polite">
        {followUpGrade ? (
          <GradeFeedbackCard grade={followUpGrade} title="Follow-up attempt" compact className="bg-background" />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Small inline pills for streak / XP / achievements after a graded action.
 * Plays the PaperBurst celebration when an achievement was earned.
 */
export function ActivityPills({
  activity,
  seedKey,
  className,
}: {
  activity: ActivityResult
  seedKey: string
  className?: string
}) {
  const achievements = activity.achievements_earned ?? []
  const xp = activity.xp_awarded ?? 0
  const streak = activity.streak
  const daily = activity.daily_set
  if (xp <= 0 && !streak && !daily && achievements.length === 0) return null
  return (
    <div
      className={cn("relative flex flex-wrap items-center gap-2", className)}
      aria-label="Progress this attempt"
    >
      {xp > 0 ? (
        <SemanticPill tone="milestone" icon={false}>
          +{xp} XP{activity.xp_total != null ? ` · ${activity.xp_total} total` : ""}
        </SemanticPill>
      ) : null}
      {streak && streak.current > 0 ? (
        <SemanticPill tone="streak">
          {streak.current}-day streak{streak.goal_met_today ? " · goal met" : ""}
        </SemanticPill>
      ) : null}
      {daily ? (
        <SemanticPill tone={daily.completed >= daily.goal ? "success" : "neutral"} icon={false}>
          Today {Math.min(daily.completed, daily.goal)}/{daily.goal}
        </SemanticPill>
      ) : null}
      {achievements.map((achievement) => (
        <SemanticPill key={achievement.id} tone="milestone">
          {achievement.title}
        </SemanticPill>
      ))}
      {achievements.length > 0 ? (
        <PaperBurst
          play
          seedKey={`${seedKey}-${achievements.map((a) => a.id).join("-")}`}
          className="pointer-events-none absolute -top-12 right-0 opacity-80"
        />
      ) : null}
    </div>
  )
}

function formatNumber(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : String(Math.round(value * 100) / 100)
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
