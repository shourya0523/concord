"use client"

/**
 * Numeric drill card (plan 2026-09-23-001 P2.8): prompt → typed number →
 * exact check against the seeded template answer (no LLM). Shows correct /
 * close / incorrect, expected vs yours, and the worked solution.
 */
import * as React from "react"

import type { DrillInstance } from "@ibpe/contracts"
import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { cn } from "@ibpe/ui/lib/utils"

import { PaperBurst, PaperSheet, SemanticPill } from "@/components/paper"
import type { DrillAttemptResponse } from "@/lib/api/drill-schemas"
import { topicLabel } from "@/lib/topics"

const UNIT_HINT: Record<string, string> = {
  "%": "Percent — e.g. 7.5% (0.075 also works)",
  x: "Multiple — e.g. 2.3x",
  $mm: "$ millions — e.g. 1,250 or $1.25bn",
  $: "Dollars — e.g. 42.50",
}

export function formatDrillValue(value: number, unit: string | null | undefined): string {
  const abs = Math.abs(value)
  const digits = unit === "x" ? 2 : unit === "$" ? 2 : unit === "%" ? 2 : abs >= 100 ? 0 : 2
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
  const sign = value < 0 && Number(body.replace(/,/g, "")) !== 0 ? "−" : ""
  if (unit === "%") return `${sign}${body}%`
  if (unit === "x") return `${sign}${body}x`
  if (unit === "$mm") return `${sign}$${body}mm`
  if (unit === "$") return `${sign}$${body}`
  return `${sign}${body}${unit ?? ""}`
}

function toleranceText(result: DrillAttemptResponse): string {
  const s = result.solution
  if (s.tolerance_kind === "relative") return `±${Math.round(s.tolerance * 1000) / 10}%`
  return `±${formatDrillValue(s.tolerance, s.unit)}`
}

function explanationSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean)
}

export function DrillCard({
  drill,
  onGraded,
  onNext,
  className,
}: {
  drill: DrillInstance
  onGraded?: (result: DrillAttemptResponse) => void
  /** Shown as "Next drill" once graded. */
  onNext?: () => void
  className?: string
}) {
  const inputId = React.useId()
  const hintId = React.useId()
  const [response, setResponse] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<DrillAttemptResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const startedAt = React.useRef<number>(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const nextRef = React.useRef<HTMLButtonElement>(null)

  // Parents key the card by drill id, so a new drill remounts with fresh state.
  React.useEffect(() => {
    startedAt.current = Date.now()
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (result) nextRef.current?.focus()
  }, [result])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!response.trim() || pending || result) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/drills/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          drill_id: drill.id,
          response_text: response.trim(),
          time_spent_ms: Math.max(0, Date.now() - startedAt.current),
        }),
      })
      if (res.status === 401) {
        setError("Sign in to check drill answers.")
        return
      }
      if (!res.ok) {
        setError("Could not check that answer — try again.")
        return
      }
      const payload = (await res.json()) as DrillAttemptResponse
      setResult(payload)
      onGraded?.(payload)
    } catch {
      setError("Network error — your answer is still in the box.")
    } finally {
      setPending(false)
    }
  }

  const unit = drill.unit ?? null
  const verdict = result
    ? result.correct
      ? { tone: "success" as const, label: "Correct" }
      : result.score > 0
        ? { tone: "streak" as const, label: "Close" }
        : { tone: "error" as const, label: "Not quite" }
    : null

  return (
    <section aria-label="Numeric drill" className={cn("space-y-4", className)}>
      <PaperSheet seedKey={`drill-${drill.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <MetadataPill>{topicLabel(drill.topic)}</MetadataPill>
          <MetadataPill>{drill.difficulty}</MetadataPill>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Seed {drill.seed}
          </span>
        </div>
        <p className="mt-3 text-base leading-relaxed" data-testid="drill-prompt">
          {drill.prompt}
        </p>

        <form className="mt-4 space-y-2" onSubmit={(e) => void submit(e)}>
          <label className="text-xs font-medium text-muted-foreground" htmlFor={inputId}>
            Your answer{unit ? ` (${unit})` : ""}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-48 flex-1 items-center border border-border focus-within:border-foreground">
              {unit === "$" || unit === "$mm" ? (
                <span aria-hidden="true" className="pl-3 text-sm text-muted-foreground">
                  $
                </span>
              ) : null}
              <input
                ref={inputRef}
                id={inputId}
                name="drill-answer"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={hintId}
                aria-invalid={result ? !result.correct : undefined}
                value={response}
                disabled={Boolean(result)}
                onChange={(event) => setResponse(event.target.value)}
                className="h-10 w-full bg-transparent px-3 text-base tabular-nums outline-none disabled:opacity-70"
                placeholder="Type a number"
              />
              {unit && unit !== "$" ? (
                <span aria-hidden="true" className="pr-3 font-mono text-sm text-muted-foreground">
                  {unit === "$mm" ? "mm" : unit}
                </span>
              ) : null}
            </div>
            <Button type="submit" disabled={!response.trim() || pending || Boolean(result)}>
              {pending ? "Checking…" : "Check answer"}
            </Button>
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {unit ? UNIT_HINT[unit] ?? `Answer in ${unit}` : "Type a number"}. Negative numbers:
            −5, (5) or “5 decrease”.
          </p>
        </form>
      </PaperSheet>

      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p role="alert" className="text-sm text-error-foreground">
            {error}
          </p>
        ) : null}
        {result && verdict ? (
          <div
            className="relative space-y-3 rounded-md border border-border bg-card p-4"
            data-testid="drill-result"
          >
            <PaperBurst
              play={result.correct}
              seedKey={`drill-burst-${drill.id}`}
              className="pointer-events-none absolute -top-6 right-2 h-24 w-48"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SemanticPill tone={verdict.tone}>{verdict.label}</SemanticPill>
              <span className="text-sm text-muted-foreground">
                Checked numerically · tolerance {toleranceText(result)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:max-w-md">
              <div>
                <dt className="text-xs text-muted-foreground">Expected</dt>
                <dd className="font-medium tabular-nums">
                  {formatDrillValue(result.solution.answer, result.solution.unit)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Yours</dt>
                <dd className="font-medium tabular-nums">
                  {result.found == null
                    ? "No number found"
                    : formatDrillValue(result.found, result.solution.unit)}
                </dd>
              </div>
            </dl>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Worked solution</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                {explanationSteps(result.solution.explanation).map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
            {result.activity?.xp_awarded ? (
              <p className="text-xs text-muted-foreground">+{result.activity.xp_awarded} XP</p>
            ) : null}
            {onNext ? (
              <Button ref={nextRef} type="button" onClick={onNext}>
                Next drill
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
