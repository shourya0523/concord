"use client"

import * as React from "react"

import { PaperSheet } from "@/components/paper"
import type { WeeklyRecap, WeekTotals } from "@/lib/data/weekly-recap"

function dayLetter(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })
}

function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return null
  const diff = now - before
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {diff === 0 ? "same as last week" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs last week`}
    </span>
  )
}

const ROWS: Array<{ key: keyof WeekTotals; label: string }> = [
  { key: "xp", label: "XP" },
  { key: "goal_days", label: "Goal days" },
  { key: "graded_cards", label: "Cards graded" },
  { key: "drills", label: "Drills" },
]

/**
 * Weekly recap on a pad sheet (DESIGN.md §16): this week so far against last
 * week. Calm numbers — no count-up, no colour as the only signal.
 */
export function WeeklyRecapCard() {
  const [recap, setRecap] = React.useState<WeeklyRecap | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/recap/weekly", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => (res.ok ? setRecap((await res.json()) as WeeklyRecap) : null))
      .catch(() => null)
    return () => controller.abort()
  }, [])

  if (!recap) return null
  return (
    <PaperSheet seedKey={`recap-${recap.week_start}`} contentClassName="space-y-5">
      <div className="space-y-5" data-testid="weekly-recap">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl tracking-tight">This week</h2>
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {formatDay(recap.week_start)} – {formatDay(recap.week_end)}
          </span>
        </div>
        <ol className="flex gap-2" aria-label="Days this week">
          {recap.days.map((day) => {
            const future = day.date > recap.today
            const state = day.goal_met ? "goal met" : day.freeze_used ? "held by a freeze" : future ? "to come" : "no goal"
            return (
              <li key={day.date} className="flex flex-col items-center gap-1" title={`${formatDay(day.date)} · ${state}`}>
                <span
                  aria-label={`${formatDay(day.date)}: ${state}`}
                  className={
                    day.goal_met
                      ? "grid size-7 place-items-center rounded-full border border-ink bg-ink text-[11px] text-paper"
                      : day.freeze_used
                        ? "grid size-7 place-items-center rounded-full border border-dashed border-pencil text-[11px] text-pencil"
                        : future
                          ? "grid size-7 place-items-center rounded-full border border-stone/60 text-[11px] text-muted-foreground/60"
                          : "grid size-7 place-items-center rounded-full border border-stone text-[11px] text-muted-foreground"
                  }
                >
                  {day.goal_met ? "✓" : day.freeze_used ? "~" : ""}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{dayLetter(day.date)}</span>
              </li>
            )
          })}
        </ol>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {ROWS.map((row) => (
            <div key={row.key} className="space-y-0.5">
              <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{row.label}</dt>
              <dd className="font-display text-3xl leading-none tabular-nums">{recap.this_week[row.key]}</dd>
              <dd>
                <Delta now={recap.this_week[row.key]} before={recap.last_week[row.key]} />
              </dd>
            </div>
          ))}
        </dl>
        {recap.achievements.length > 0 ? (
          <p className="text-sm">
            Closed this week: {recap.achievements.map((a) => a.title).join(" · ")}
          </p>
        ) : null}
      </div>
    </PaperSheet>
  )
}
