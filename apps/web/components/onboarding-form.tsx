"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"
import { cn } from "@ibpe/ui/lib/utils"

import {
  Annotate,
  CircledNumber,
  HandwritingHeadline,
  HeatStrip,
  PaperSheet,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import {
  TargetSelectIsland,
  readStoredTargets,
} from "@/components/target-select-island"
import { AnswerCard, startPracticeSession } from "@/components/daily-set-player"
import { GradeFeedbackCard } from "@/components/grade-feedback-card"
import type { AttemptResponse } from "@/lib/api/schemas"
import type { PlacementQuestion, PlacementResponse } from "@/lib/api/retention-schemas"
import { homePathFor } from "@/lib/auth/post-auth"
import { detectTimeZone } from "@/lib/local-day"
import { sortTopicSlugs, topicLabel } from "@/lib/topics"

type LearningMode = "company_prep" | "concept_learn"
type Track = "IB" | "PE" | "Both"

const STEPS = [
  "Welcome",
  "Path",
  "Track",
  "Firms",
  "Date",
  "Reminder",
  "Focus",
  "Placement",
] as const
const REMINDER_STEP = 5
const FOCUS_STEP = 6
const PLACEMENT_STEP = 7

const REMINDER_HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21]

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm"
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}${suffix}`
}

type PlacementPhase = "intro" | "loading" | "running" | "done" | "empty"

type HeatPayload = {
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

export function OnboardingForm({
  dailySet = true,
  initialStep,
}: {
  /** `daily_set` flag — where "Enter Concord" lands. */
  dailySet?: boolean
  /** Deep link (e.g. `placement` from Today). */
  initialStep?: string
} = {}) {
  const router = useRouter()
  const home = homePathFor(dailySet)
  const [step, setStep] = React.useState(initialStep === "placement" ? PLACEMENT_STEP : 0)
  const [modes, setModes] = React.useState<LearningMode[]>([
    "company_prep",
    "concept_learn",
  ])
  const [track, setTrack] = React.useState<Track>("IB")
  const [role, setRole] = React.useState("Investment Banking Analyst")
  const [targets, setTargets] = React.useState<string[]>([])
  const [heatPreview, setHeatPreview] = React.useState<
    Array<{ topic: string; intensity: number; sampleSize: number }>
  >([])
  const [interviewDate, setInterviewDate] = React.useState("")
  const [availability, setAvailability] = React.useState("45")
  const [focusPrompt, setFocusPrompt] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [typing, setTyping] = React.useState(false)
  const [timezone, setTimezone] = React.useState("UTC")
  const [reminderHour, setReminderHour] = React.useState<number | null>(19)
  const [placementPhase, setPlacementPhase] = React.useState<PlacementPhase>("intro")
  const [placement, setPlacement] = React.useState<PlacementQuestion[]>([])
  const [placementIndex, setPlacementIndex] = React.useState(0)
  const [placementSession, setPlacementSession] = React.useState<string | null>(null)
  const [placementGrade, setPlacementGrade] = React.useState<AttemptResponse["grade"] | null>(null)
  const [placementScores, setPlacementScores] = React.useState<Array<{ topic: string | null; score: number }>>([])
  const [placementError, setPlacementError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setTargets(readStoredTargets())
    // P5.1: streaks, the daily set and reminders run on the learner's local day.
    setTimezone(detectTimeZone())
  }, [])

  // Selected-firm preview heat strip — aggregate intensity across selection.
  React.useEffect(() => {
    if (targets.length === 0) {
      setHeatPreview([])
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams()
    targets.forEach((id) => params.append("firm_id", id))
    fetch(`/api/prep/heat?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as HeatPayload
      })
      .then((payload) => {
        if (!payload) return
        const aggregate = new Map<
          string,
          { intensity: number; sampleSize: number }
        >()
        for (const row of payload.topics) {
          if (row.topic_id === "untagged") continue
          const entry = aggregate.get(row.topic_id) ?? {
            intensity: 0,
            sampleSize: 0,
          }
          entry.intensity = Math.max(entry.intensity, row.intensity)
          entry.sampleSize += row.sample_size
          aggregate.set(row.topic_id, entry)
        }
        setHeatPreview(
          sortTopicSlugs(aggregate.keys())
            .slice(0, 6)
            .map((topic) => ({ topic, ...aggregate.get(topic)! }))
        )
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [targets])

  const needsFirms = modes.includes("company_prep")
  const daysUntil = interviewDate
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(`${interviewDate}T00:00:00Z`) - Date.now()) / 86_400_000
        )
      )
    : null

  function toggleMode(mode: LearningMode) {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
  }

  function canAdvance(): boolean {
    if (step === 1) return modes.length > 0
    if (step === 3) return !needsFirms || targets.length > 0
    return true
  }

  async function saveProfile() {
    setSaving(true)
    try {
      if (targets.length > 0) {
        await fetch("/api/targets", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            firm_ids: targets,
            primary_firm_id: targets[0],
          }),
        })
      }
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modes,
          track,
          role,
          interview_date: interviewDate || null,
          availability_minutes: Number.parseInt(availability, 10) || null,
          focus_prompt: focusPrompt.trim() || null,
          timezone,
          reminder_hour: reminderHour,
        }),
      })
      setStep(PLACEMENT_STEP)
    } finally {
      setSaving(false)
    }
  }

  async function finishPlacement(action: "complete" | "skip") {
    setSaving(true)
    try {
      await fetch("/api/placement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, answered: placementScores.length }),
      }).catch(() => undefined)
      router.push(home)
    } finally {
      setSaving(false)
    }
  }

  async function startPlacement() {
    setPlacementPhase("loading")
    setPlacementError(null)
    try {
      const response = await fetch("/api/placement", { cache: "no-store" })
      const payload = response.ok ? ((await response.json()) as PlacementResponse) : null
      const questions = payload?.questions ?? []
      if (questions.length === 0) {
        setPlacementPhase("empty")
        return
      }
      const sessionId = await startPracticeSession(
        questions.map((question) => question.question_id),
        targets.slice(0, 1),
      )
      setPlacement(questions)
      setPlacementSession(sessionId)
      setPlacementIndex(0)
      setPlacementScores([])
      setPlacementGrade(null)
      setPlacementPhase("running")
    } catch (err) {
      setPlacementError(err instanceof Error ? err.message : "Placement check unavailable")
      setPlacementPhase("empty")
    }
  }

  function nextPlacement() {
    setPlacementGrade(null)
    if (placementIndex + 1 >= placement.length) setPlacementPhase("done")
    else setPlacementIndex((value) => value + 1)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <nav aria-label="Onboarding steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={
              index === step
                ? "rounded-full bg-ink px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-paper uppercase"
                : index < step
                  ? "rounded-full border border-border px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase line-through"
                  : "rounded-full border border-border px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
            }
            aria-current={index === step ? "step" : undefined}
          >
            {label}
          </span>
        ))}
      </nav>

      {step === 0 ? (
        <div className="space-y-6">
          <Warren mood="encouraging" size={88} />
          <HandwritingHeadline phrase="Let's build your prep" />
          <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Concord pairs{" "}
            <strong className="text-foreground">company rooms</strong> — what
            your target firms actually ask, from occurrence signals — with{" "}
            <strong className="text-foreground">concept labs</strong> that teach
            the underlying finance. A few quick answers tune your daily set,
            study plan, and session packs.
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">
            Which way do you prep?
          </h1>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                [
                  "company_prep",
                  "Company prep",
                  "Heat-ranked drills for your target firms.",
                ],
                [
                  "concept_learn",
                  "Learn",
                  "Modules and diagram labs that build concepts.",
                ],
              ] as const
            ).map(([id, label, blurb]) => {
              const on = modes.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMode(id)}
                  className="text-left"
                >
                  <div
                    className={cn(
                      "border border-border bg-background/30 px-4 py-4",
                      on ? "outline-2 outline-ink" : "opacity-75",
                    )}
                  >
                    <p className="font-medium">
                      {on ? (
                        <Annotate
                          type="underline"
                          color="var(--lime)"
                          padding={2}
                        >
                          <span>{label}</span>
                        </Annotate>
                      ) : (
                        label
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {blurb}
                    </p>
                    {on ? (
                      <p className="mt-2 font-mono text-[10px] tracking-wide uppercase">
                        Selected
                      </p>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Pick at least one — both is recommended.
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">
            Track and role
          </h1>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Track">
            {(["IB", "PE", "Both"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={track === value}
                onClick={() => setTrack(value)}
                className={
                  track === value
                    ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
                }
              >
                {value}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </div>
          <Warren
            mood="idle"
            userFocused={typing}
            size={48}
            aside="Analyst or Associate — I'll calibrate drill depth to it."
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">Target firms</h1>
          <section className="max-w-xl border border-border bg-background/30 px-4 py-4">
            <div className="space-y-3">
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Multi-select target set
              </p>
              <TargetSelectIsland
                value={targets}
                onChange={setTargets}
                className="max-w-full"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Selected firms stay as removable paper chips; Concord weights
                heat and packs against the full set, with the first firm saved
                as primary.
              </p>
            </div>
          </section>
          {needsFirms && targets.length === 0 ? (
            <p
              role="alert"
              className="border border-dashed border-error px-3 py-2 text-sm"
            >
              Company prep needs at least one target firm — heat and packs key
              off this set.
            </p>
          ) : null}
          {heatPreview.length > 0 ? (
            <PaperSheet seedKey="onboarding-heat-preview">
              <div className="space-y-2">
                <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  Signal preview · reported occurrence heat
                </p>
                <HeatStrip entries={heatPreview} />
                <p className="text-xs text-muted-foreground">
                  Directional firm signals only — teaching answers come from the
                  corpus.
                </p>
              </div>
            </PaperSheet>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">
            Interview date and time budget
          </h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interview">Interview date</Label>
              <Input
                id="interview"
                type="date"
                value={interviewDate}
                onChange={(event) => setInterviewDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">Daily minutes</Label>
              <Input
                id="availability"
                type="number"
                min={10}
                max={480}
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              />
            </div>
          </div>
          {daysUntil !== null ? (
            <div className="flex items-center gap-4">
              <CircledNumber
                value={String(daysUntil)}
                label="days remaining"
                size="sm"
              />
              <p className="max-w-xs text-sm text-muted-foreground">
                Your roadmap mixes firm drills and module checkpoints against
                this date — urgency rises calmly as it approaches.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No date yet — the plan still sequences modules and drills, without
              urgency.
            </p>
          )}
        </div>
      ) : null}

      {step === REMINDER_STEP ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">
            When should we nudge you?
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Your streak and daily set follow your local day. Pick a time for a
            gentle reminder when today&apos;s set is still open — or none at all.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder time">
            {[null, ...REMINDER_HOURS].map((hour) => (
              <button
                key={hour ?? "none"}
                type="button"
                aria-pressed={reminderHour === hour}
                onClick={() => setReminderHour(hour)}
                className={
                  reminderHour === hour
                    ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
                }
              >
                {hour === null ? "No reminder" : hourLabel(hour)}
              </button>
            ))}
          </div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Time zone · {timezone} (from this device)
          </p>
        </div>
      ) : null}

      {step === FOCUS_STEP ? (
        <div className="space-y-5">
          <h1 className="font-display text-3xl tracking-tight">
            Anything specific coming up?
          </h1>
          <div className="space-y-2">
            <Label htmlFor="focus">Focus prompt (optional)</Label>
            <Input
              id="focus"
              placeholder="Superday — accounting + paper LBO"
              value={focusPrompt}
              onChange={(event) => setFocusPrompt(event.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </div>
          <WarrenCallout mood="encouraging" userFocused={typing} bracket>
            {targets.length > 0
              ? "I'll weight your first session pack toward this. You can change everything later in Settings."
              : "You can set firms and dates later — but heat prep works best with targets picked."}
          </WarrenCallout>
        </div>
      ) : null}

      {step === PLACEMENT_STEP ? (
        <div className="space-y-5">
          {placementPhase === "intro" || placementPhase === "loading" ? (
            <>
              <h1 className="font-display text-3xl tracking-tight">
                Quick placement check
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                Ten questions across accounting, EV, valuation, LBOs and M&amp;A,
                from easier to harder. Each answer is graded, seeds your review
                cards and concept mastery — so readiness is honest from day one.
                About ten minutes; skip it if you&apos;d rather start straight away.
              </p>
              <WarrenCallout mood="encouraging" bracket>
                No pressure — a wrong answer here just tells me where to start.
              </WarrenCallout>
            </>
          ) : null}
          {placementPhase === "running" && placement[placementIndex] ? (
            placementGrade ? (
              <div className="space-y-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  Question {placementIndex + 1} of {placement.length}
                </p>
                <p className="font-display text-xl leading-snug tracking-tight">
                  {placement[placementIndex].prompt}
                </p>
                <GradeFeedbackCard grade={placementGrade} />
                <Button type="button" onClick={nextPlacement}>
                  {placementIndex + 1 >= placement.length ? "See results" : "Next question"}
                </Button>
              </div>
            ) : (
              <AnswerCard
                key={placement[placementIndex].question_id}
                sessionId={placementSession}
                questionId={placement[placementIndex].question_id}
                prompt={placement[placementIndex].prompt}
                header={
                  <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                    Question {placementIndex + 1} of {placement.length}
                    {placement[placementIndex].topic
                      ? ` · ${topicLabel(placement[placementIndex].topic as string)}`
                      : ""}
                  </p>
                }
                onGraded={(result) => {
                  setPlacementGrade(result.grade ?? null)
                  setPlacementScores((prev) => [
                    ...prev,
                    { topic: placement[placementIndex]?.topic ?? null, score: result.grade?.score ?? 0 },
                  ])
                  if (!result.grade) nextPlacement()
                }}
                onSkip={nextPlacement}
              />
            )
          ) : null}
          {placementPhase === "done" ? (
            <div className="space-y-4">
              <h1 className="font-display text-3xl tracking-tight">Placement done</h1>
              <p className="text-sm text-muted-foreground">
                {placementScores.length} answer{placementScores.length === 1 ? "" : "s"} graded
                {placementScores.length > 0
                  ? ` · average ${Math.round(
                      (placementScores.reduce((sum, row) => sum + row.score, 0) /
                        placementScores.length) *
                        100,
                    )}%`
                  : ""}
                . Your first daily set starts from what you missed.
              </p>
              <WarrenCallout mood="celebrating" bracket>
                That&apos;s your baseline. Readiness will move with every graded card.
              </WarrenCallout>
            </div>
          ) : null}
          {placementPhase === "empty" ? (
            <p role="status" className="border border-dashed border-border px-3 py-2 text-sm">
              {placementError ??
                "No placement questions are available yet — you can start with today's set."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {step > 0 && step < PLACEMENT_STEP ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((value) => value - 1)}
          >
            Back
          </Button>
        ) : null}
        {step < FOCUS_STEP ? (
          <Button
            type="button"
            disabled={!canAdvance()}
            onClick={() => setStep((value) => value + 1)}
          >
            Continue
          </Button>
        ) : step === FOCUS_STEP ? (
          <Button
            type="button"
            disabled={saving || (needsFirms && targets.length === 0)}
            onClick={() => void saveProfile()}
          >
            {saving ? "Saving…" : "Save and continue"}
          </Button>
        ) : placementPhase === "intro" || placementPhase === "loading" ? (
          <>
            <Button
              type="button"
              disabled={placementPhase === "loading" || saving}
              onClick={() => void startPlacement()}
            >
              {placementPhase === "loading" ? "Preparing…" : "Start placement check"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              disabled={saving}
              onClick={() => void finishPlacement("skip")}
            >
              Skip — take me to {dailySet ? "Today" : "my dashboard"}
            </button>
          </>
        ) : placementPhase === "running" ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            disabled={saving}
            onClick={() => void finishPlacement(placementScores.length > 0 ? "complete" : "skip")}
          >
            Finish early
          </button>
        ) : (
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              void finishPlacement(placementPhase === "done" && placementScores.length > 0 ? "complete" : "skip")
            }
          >
            {saving ? "Saving…" : dailySet ? "Go to Today" : "Enter Concord"}
          </Button>
        )}
        {step > 0 && step < FOCUS_STEP ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setStep(FOCUS_STEP)}
          >
            Skip to finish
          </button>
        ) : null}
      </div>
    </div>
  )
}
