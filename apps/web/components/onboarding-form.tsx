"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"

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
import { sortTopicSlugs } from "@/lib/topics"

type LearningMode = "company_prep" | "concept_learn"
type Track = "IB" | "PE" | "Both"

const STEPS = ["Welcome", "Path", "Track", "Firms", "Date", "Focus"] as const

type HeatPayload = {
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

export function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = React.useState(0)
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

  React.useEffect(() => {
    setTargets(readStoredTargets())
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

  async function finish() {
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
        }),
      })
      router.push("/dashboard")
    } finally {
      setSaving(false)
    }
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
            the underlying finance. Six quick answers tune your dashboard, study
            plan, and session packs.
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
                  <PaperSheet
                    seedKey={`path-${id}`}
                    torn={false}
                    className={on ? "outline-2 outline-ink" : "opacity-75"}
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
                  </PaperSheet>
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
          <PaperSheet
            seedKey="onboarding-target-select"
            torn={false}
            className="max-w-xl"
          >
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
          </PaperSheet>
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
            <PaperSheet seedKey="onboarding-heat-preview" torn={false}>
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

      {step === 5 ? (
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

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((value) => value - 1)}
          >
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            disabled={!canAdvance()}
            onClick={() => setStep((value) => value + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            disabled={saving || (needsFirms && targets.length === 0)}
            onClick={() => void finish()}
          >
            {saving ? "Saving…" : "Enter Concord"}
          </Button>
        )}
        {step > 0 && step < STEPS.length - 1 ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setStep(STEPS.length - 1)}
          >
            Skip to finish
          </button>
        ) : null}
      </div>
    </div>
  )
}
