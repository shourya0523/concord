"use client"

/**
 * Today — post-login home (plan 2026-09-23-001 P4.4). Readiness is the hero
 * (KD-7); streak, freezes and XP sit beside it; the daily set launches in-page.
 * Numbers render statically (calm rule). Rewards follow the ceremony budget
 * (DESIGN.md §16): the FILED stamp and tally mark fire only on a confirmed goal.
 */
import * as React from "react"
import Link from "next/link"

import type { ActivityResult } from "@ibpe/contracts"
import { Button } from "@ibpe/ui/components/button"

import { DailySetPlayer } from "@/components/daily-set-player"
import {
  BusinessCard,
  CircledNumber,
  FiledStamp,
  HeatStrip,
  PaperSheet,
  SemanticPill,
  TallyCalendar,
  Tombstone,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import { readStoredTargets } from "@/components/target-select-island"
import { tombstoneFace } from "@/lib/achievements"
import { careerCard } from "@/lib/career"
import type {
  DailySet,
  DailySetResponse,
  FirmReadiness,
  TodayResponse,
} from "@/lib/api/retention-schemas"

type Phase = "loading" | "ready" | "unauthenticated" | "error"

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`
}

function deltaLabel(delta: number | null): string | null {
  if (delta == null) return null
  const points = Math.round(delta * 100)
  if (points === 0) return "±0 this week"
  return `${points > 0 ? "+" : "−"}${Math.abs(points)} this week`
}

function formatLocalDate(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
}

function ReadinessHero({ row }: { row: FirmReadiness }) {
  const delta = deltaLabel(row.weekly_delta)
  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {row.firm_name} readiness
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <CircledNumber value={percent(row.readiness)} size="lg" />
        {delta ? (
          <SemanticPill tone={(row.weekly_delta ?? 0) >= 0 ? "success" : "weak"}>{delta}</SemanticPill>
        ) : (
          <span className="text-xs text-muted-foreground">Trend starts after your first day</span>
        )}
      </div>
      {row.topics.length > 0 ? (
        <HeatStrip
          compact
          entries={row.topics.slice(0, 5).map((topic) => ({
            topic: topic.topic,
            intensity: topic.weight,
            sampleSize: topic.sample_size,
            weak: topic.mastery < 0.68,
          }))}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          No hot topic maps to a concept lab yet — readiness appears once one does.
        </p>
      )}
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        Heat-weighted mastery across {row.firm_name}&apos;s most-asked topics. Heat is a firm signal;
        mastery comes from your graded answers.
      </p>
    </div>
  )
}

export function TodayIsland({ gamification = true }: { gamification?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [today, setToday] = React.useState<TodayResponse | null>(null)
  const [set, setSet] = React.useState<DailySet | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const targetsRef = React.useRef<string[]>([])
  const [celebrate, setCelebrate] = React.useState(false)
  const [lastActivity, setLastActivity] = React.useState<ActivityResult | null>(null)

  const load = React.useCallback(async (firmIds: string[], signal?: AbortSignal) => {
    try {
      const params = firmIds.map((id) => `firm_id=${encodeURIComponent(id)}`).join("&")
      const [todayRes, setRes] = await Promise.all([
        fetch(`/api/today${params ? `?${params}` : ""}`, { signal, cache: "no-store" }),
        fetch("/api/daily-set", { signal, cache: "no-store" }),
      ])
      if (todayRes.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!todayRes.ok) {
        setPhase("error")
        return
      }
      const payload = (await todayRes.json()) as TodayResponse
      setToday(payload)
      if (setRes.ok) setSet(((await setRes.json()) as DailySetResponse).set)
      if (payload.achievements_earned.length > 0) setCelebrate(true)
      setPhase("ready")
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setPhase("error")
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    targetsRef.current = readStoredTargets()
    void load(targetsRef.current, controller.signal)
    return () => controller.abort()
  }, [load])

  function handleProgress(nextSet: DailySet, activity: ActivityResult | null) {
    setSet(nextSet)
    if (activity) setLastActivity(activity)
    if (activity?.streak?.goal_met_today && !today?.streak.goal_met_today) setCelebrate(true)
    if ((activity?.achievements_earned.length ?? 0) > 0) setCelebrate(true)
  }

  function closePlayer() {
    setPlaying(false)
    void load(targetsRef.current)
  }

  if (phase === "loading") {
    return (
      <section className="flex items-center gap-4 border border-border bg-background/30 px-4 py-4">
        <Warren mood="thinking" size={48} />
        <p className="text-sm text-muted-foreground">Building today&apos;s set…</p>
      </section>
    )
  }

  if (phase === "unauthenticated") {
    return (
      <section className="flex flex-wrap items-start gap-4 border border-border bg-background/30 px-4 py-4">
        <Warren mood="idle" size={56} />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="font-medium">Sign in to see today&apos;s set.</p>
          <Link href="/sign-in">
            <Button>Sign in</Button>
          </Link>
        </div>
      </section>
    )
  }

  if (phase === "error" || !today) {
    return (
      <section className="flex flex-wrap items-center gap-4 border border-dashed border-error px-4 py-4">
        <Warren mood="concerned" size={48} />
        <p className="min-w-0 flex-1 text-sm">Today didn&apos;t load. Your progress is untouched.</p>
        <Button variant="outline" onClick={() => void load(targetsRef.current)}>
          Retry
        </Button>
      </section>
    )
  }

  const goal = set?.goal ?? today.daily_set.goal
  const done = set ? set.items.filter((item) => item.done_at).length : today.daily_set.completed
  const total = set?.items.length ?? today.daily_set.total_items
  const setComplete = total > 0 && done >= total
  const minutes = set?.estimated_minutes ?? today.daily_set.estimated_minutes
  const primary =
    today.readiness.find((row) => row.firm_id === today.primary_firm_id) ?? today.readiness[0] ?? null
  const others = today.readiness.filter((row) => row !== primary)
  const streak = lastActivity?.streak
    ? { ...today.streak, current: lastActivity.streak.current, freezes: lastActivity.streak.freezes, goal_met_today: lastActivity.streak.goal_met_today }
    : today.streak
  const xpTotal = lastActivity?.xp_total ?? today.xp.total
  const card = careerCard(xpTotal, today.xp.track ?? "IB")
  // A goal met during this visit adds today's mark to the run without a reload.
  const metThisVisit = Boolean(lastActivity?.goal_met_now) && !today.streak.goal_met_today
  const run = today.streak.run ?? []
  const tallyRun = metThisVisit ? [...run, "goal" as const] : run
  const monthLabel = new Date(`${today.local_date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  })
  const newAchievements = [...today.achievements_earned, ...(lastActivity?.achievements_earned ?? [])]

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {formatLocalDate(today.local_date)} · {today.timezone}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Today</h1>
        </div>
        {today.days_until_interview != null ? (
          <div className="flex items-center gap-3" aria-label="Interview countdown">
            <CircledNumber value={String(today.days_until_interview)} label="days to interview" size="sm" />
          </div>
        ) : (
          <Link href="/settings" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Add your interview date →
          </Link>
        )}
      </header>

      {playing && set ? (
        <DailySetPlayer
          set={set}
          firmIds={today.primary_firm_id ? [today.primary_firm_id] : today.readiness.map((row) => row.firm_id)}
          onProgress={handleProgress}
          onClose={closePlayer}
        />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.9fr)]">
          <section className="min-w-0 space-y-6">
            <PaperSheet seedKey={`today-readiness-${primary?.firm_id ?? "none"}`}>
              {primary ? (
                <ReadinessHero row={primary} />
              ) : (
                <div className="space-y-2">
                  <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                    Readiness
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pick target firms to see how ready you are for each — readiness weights your concept
                    mastery by what those firms actually ask.
                  </p>
                  <Link href="/companies" className="text-sm underline-offset-4 hover:underline">
                    Choose target firms →
                  </Link>
                </div>
              )}
            </PaperSheet>

            {others.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Other target firms">
                {others.map((row) => (
                  <li key={row.firm_id} className="border border-border px-3 py-3">
                    <p className="truncate text-sm font-medium">{row.firm_name}</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-2xl tracking-tight tabular-nums">{percent(row.readiness)}</span>
                      {deltaLabel(row.weekly_delta) ? (
                        <span className="text-xs text-muted-foreground">{deltaLabel(row.weekly_delta)}</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            <section className="relative space-y-4 border border-ink/20 bg-streak/10 px-4 py-5" aria-label="Daily set">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                    Today&apos;s set · {total} cards · ~{minutes} min
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-4 font-display text-2xl tracking-tight">
                    {setComplete ? "Set complete" : `${done} of ${total || goal} done`}
                    {streak.goal_met_today ? (
                      <FiledStamp localDate={today.local_date} play={celebrate && metThisVisit} />
                    ) : null}
                  </div>
                </div>
                {total > 0 ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => setPlaying(true)}
                    variant={setComplete ? "outline" : "default"}
                  >
                    {setComplete ? "Review today's cards" : done > 0 ? "Continue today's set" : "Start today's set"}
                  </Button>
                ) : (
                  <Link href="/study">
                    <Button type="button" variant="outline">
                      Open Study
                    </Button>
                  </Link>
                )}
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full border border-border bg-background"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total || goal}
                aria-valuenow={done}
                aria-label="Daily set progress"
              >
                <div
                  className="h-full bg-streak"
                  style={{ width: `${(total || goal) ? Math.min(100, (done / (total || goal)) * 100) : 0}%` }}
                />
              </div>
              {set && set.items.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Cards in today's set">
                  {set.items.map((item) => (
                    <li key={item.id}>
                      <SemanticPill tone={item.done_at ? "success" : "neutral"} icon={Boolean(item.done_at)}>
                        {item.kind === "firm_heat"
                          ? "firm heat"
                          : item.kind === "drill"
                            ? "drill"
                            : item.kind}
                      </SemanticPill>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {today.daily_set.cards_done_today} graded card{today.daily_set.cards_done_today === 1 ? "" : "s"} today
                count toward the goal of {goal} — answers in Study count too.
              </p>
            </section>
          </section>

          <aside className="min-w-0 space-y-6 border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            <WarrenCallout mood={today.warren.mood} bracket size={56}>
              {today.warren.message}
            </WarrenCallout>

            {gamification ? (
              <TallyCalendar
                current={streak.current}
                longest={streak.longest}
                freezes={streak.freezes}
                run={tallyRun}
                goalMetToday={streak.goal_met_today}
                drawLatest={metThisVisit}
                freezeJustEarned={Boolean(lastActivity?.freeze_earned)}
                monthLabel={monthLabel}
              />
            ) : null}
            {gamification && today.streak.freeze_used_yesterday ? (
              <p className="text-xs text-muted-foreground">A freeze covered yesterday. It&apos;s drawn in pencil.</p>
            ) : null}

            {gamification ? (
              <BusinessCard
                title={card.title}
                nextTitle={card.next_title}
                level={card.level}
                track={card.track}
                xp={card.xp}
                floor={card.floor}
                next={card.next}
              />
            ) : null}

            {newAchievements.length > 0 ? (
              <section className="space-y-2" aria-label="New on the shelf">
                <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  New on the shelf
                </p>
                <ul className="grid grid-cols-2 gap-3">
                  {newAchievements.map((a) => {
                    const face = tombstoneFace(a)
                    return (
                      <li key={a.id}>
                        <Tombstone id={a.id} face={face.face} what={face.what} compact place earnedAt={new Date().toISOString()} />
                      </li>
                    )
                  })}
                </ul>
                <Link href="/achievements" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  See the shelf →
                </Link>
              </section>
            ) : null}

            {!today.placement_completed_at ? (
              <section className="space-y-2 border border-border px-4 py-3 text-sm">
                <p className="font-medium">Calibrate with a placement check</p>
                <p className="text-xs text-muted-foreground">
                  Ten quick questions seed your review cards and concept mastery so readiness is honest from day one.
                </p>
                <Link href="/onboarding?step=placement" className="text-sm underline-offset-4 hover:underline">
                  Take the placement check →
                </Link>
              </section>
            ) : null}

            <nav aria-label="Shortcuts" className="space-y-1 border-t border-border pt-4 text-sm">
              <Link className="block text-muted-foreground hover:text-foreground" href="/study">
                Study freely →
              </Link>
              <Link className="block text-muted-foreground hover:text-foreground" href="/simulator">
                Weekly mock (simulator) →
              </Link>
              <Link className="block text-muted-foreground hover:text-foreground" href="/dashboard">
                Overview dashboard →
              </Link>
            </nav>
          </aside>
        </div>
      )}
    </div>
  )
}
