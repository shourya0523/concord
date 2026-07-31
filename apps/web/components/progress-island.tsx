"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import {
  Annotate,
  HeatStrip,
  PaperSheet,
  SemanticPill,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import { fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import { conceptIdForTopic, topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery } from "@/lib/weak-topics"

/**
 * Progress / analytics (DESIGN.md §10.13). Firm readiness = average mastery
 * of the concepts behind a firm's hot topics (heat intensity ≥ 0.5), mapped
 * through the five concept↔topic pairs in lib/topics. Module bars derive
 * from real completed_checkpoint_ids (the API percent field is 0..1-clamped
 * while the DB stores 0..100). All numbers render statically — calm rule.
 */

type MasteryItem = { subject_type: string; subject_id: string; score: number }

type ProgressPayload = {
  activity: Array<{ date: string; attempts: number }>
  streak_days: number
  total_attempts: number
  accuracy: Array<{ week: string; accuracy: number | null; attempts: number }>
  module_progress: Array<{
    module_id: string
    percent: number
    completed_checkpoint_ids: string[]
  }>
  sessions: Array<{ id: string; mode: string | null; started_at: string; firm_id: string | null }>
  source: string
  note?: string
}

type ModuleItem = {
  id: string
  slug: string
  title: string
  checkpoints: Array<{ id: string }>
}

type HeatPayload = {
  topics: Array<{ firm_id: string; topic_id: string; intensity: number; sample_size: number }>
}

type Phase = "loading" | "ready" | "unauthenticated" | "error"

const HOT_THRESHOLD = 0.5
const DAY_MS = 86_400_000

const HEAT_CELL_CLASSES = [
  "bg-heat-0 text-muted-foreground",
  "bg-heat-1 text-foreground",
  "bg-heat-2 text-foreground",
  "bg-heat-3 text-foreground",
  "bg-heat-4 text-foreground",
]

function attemptsBand(attempts: number): 0 | 1 | 2 | 3 | 4 {
  if (attempts <= 0) return 0
  if (attempts === 1) return 1
  if (attempts === 2) return 2
  if (attempts === 3) return 3
  return 4
}

function readinessTier(percent: number): { label: string; tone: "milestone" } {
  if (percent < 40) return { label: "Needs work", tone: "milestone" }
  if (percent < 70) return { label: "Building", tone: "milestone" }
  return { label: "Ready", tone: "milestone" }
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ProgressIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [progress, setProgress] = React.useState<ProgressPayload | null>(null)
  const [modules, setModules] = React.useState<ModuleItem[]>([])
  const [mastery, setMastery] = React.useState<MasteryItem[]>([])
  const [heat, setHeat] = React.useState<HeatPayload["topics"]>([])
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<Map<string, string>>(new Map())

  const load = React.useCallback(async (signal: AbortSignal) => {
    setPhase("loading")
    try {
      const [progressRes, moduleRes, masteryRes] = await Promise.all([
        fetch("/api/progress", { signal }),
        fetch("/api/learn/modules", { signal }),
        fetch("/api/mastery", { signal }),
      ])
      if (progressRes.status === 401 || masteryRes.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!progressRes.ok || !moduleRes.ok) {
        setPhase("error")
        return
      }
      const progressPayload = (await progressRes.json()) as ProgressPayload
      const modulePayload = (await moduleRes.json()) as { items: ModuleItem[] }
      const masteryPayload = masteryRes.ok
        ? ((await masteryRes.json()) as { items?: MasteryItem[] })
        : { items: [] }
      const storedTargets = readStoredTargets()

      let heatTopics: HeatPayload["topics"] = []
      if (storedTargets.length > 0) {
        const params = storedTargets.map((id) => `firm_id=${encodeURIComponent(id)}`).join("&")
        const heatRes = await fetch(`/api/prep/heat?${params}`, { signal }).catch(() => null)
        if (heatRes?.ok) {
          heatTopics = ((await heatRes.json()) as HeatPayload).topics ?? []
        }
      }

      setProgress(progressPayload)
      setModules(modulePayload.items)
      setMastery(masteryPayload.items ?? [])
      setTargets(storedTargets)
      setHeat(heatTopics)
      setPhase("ready")
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setPhase("error")
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    void fetchFirmOptions().then((options) => {
      setFirmNames(new Map(options.map((firm) => [firm.id, firm.name])))
    })
    return () => controller.abort()
  }, [load])

  const masteryByConcept = new Map(
    mastery
      .filter((item) => item.subject_type === "concept")
      .map((item) => [item.subject_id, item.score]),
  )
  const weakTopics = weakTopicsFromMastery(
    mastery.map((item) => ({
      subject_type: item.subject_type as "concept",
      subject_id: item.subject_id,
      score: item.score,
    })),
  )
  const weakTopicSet = new Set(weakTopics.map((weak) => weak.topic))

  const readinessRows = targets.map((firmId) => {
    const hotTopics = heat.filter(
      (row) => row.firm_id === firmId && row.intensity >= HOT_THRESHOLD && row.topic_id !== "untagged",
    )
    const conceptIds = [
      ...new Set(
        hotTopics
          .map((row) => conceptIdForTopic(row.topic_id))
          .filter((id): id is string => id !== null),
      ),
    ]
    const percent =
      conceptIds.length === 0
        ? null
        : Math.round(
            (conceptIds.reduce((sum, id) => sum + (masteryByConcept.get(id) ?? 0), 0) /
              conceptIds.length) *
              100,
          )
    return { firmId, hotTopics, conceptIds, percent }
  })

  const progressByModule = new Map(
    (progress?.module_progress ?? []).map((row) => [row.module_id, row]),
  )
  const moduleRows = modules.map((module) => {
    const row = progressByModule.get(module.id)
    const total = module.checkpoints.length
    const done = row
      ? module.checkpoints.filter((checkpoint) =>
          row.completed_checkpoint_ids.includes(checkpoint.id),
        ).length
      : 0
    const ratio = total > 0 ? done / total : Math.min(1, Math.max(0, row?.percent ?? 0))
    return { module, percent: Math.round(ratio * 100), done, total }
  })

  const activityByDate = new Map(
    (progress?.activity ?? []).map((row) => [row.date, row.attempts]),
  )
  const days = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(Date.now() - (27 - index) * DAY_MS)
    const key = date.toISOString().slice(0, 10)
    return { key, dayOfMonth: date.getUTCDate(), attempts: activityByDate.get(key) ?? 0 }
  })
  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14, 21), days.slice(21, 28)]
  const todayKey = new Date().toISOString().slice(0, 10)

  const isEmpty =
    (progress?.total_attempts ?? 0) === 0 &&
    (progress?.module_progress ?? []).length === 0 &&
    (progress?.sessions ?? []).length === 0

  if (phase === "loading") {
    return (
      <PaperSheet seedKey="progress-loading" torn={false}>
        <div className="flex items-center gap-4">
          <Warren mood="thinking" size={48} />
          <p className="text-sm text-muted-foreground">Reading your practice history…</p>
        </div>
      </PaperSheet>
    )
  }

  if (phase === "error") {
    return (
      <PaperSheet seedKey="progress-error" torn={false}>
        <div className="flex flex-wrap items-center gap-4">
          <Warren mood="concerned" size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Progress didn&apos;t load.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The analytics service is unreachable right now. Your history is untouched.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const controller = new AbortController()
              void load(controller.signal)
            }}
          >
            Retry
          </Button>
        </div>
      </PaperSheet>
    )
  }

  if (phase === "unauthenticated") {
    return (
      <PaperSheet seedKey="progress-signed-out" torn={false}>
        <div className="flex flex-wrap items-start gap-4">
          <Warren mood="idle" size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Sign in to see progress.</p>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Readiness, module bars, accuracy, and streaks are computed from your saved attempts —
              they need an account to belong to.
            </p>
            <div className="mt-4">
              <Link href="/sign-in">
                <Button>Sign in</Button>
              </Link>
            </div>
          </div>
        </div>
      </PaperSheet>
    )
  }

  if (isEmpty) {
    return (
      <PaperSheet seedKey="progress-empty" torn={false}>
        <div className="flex flex-wrap items-start gap-4">
          <Warren mood="encouraging" size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Complete your first drill to open progress.</p>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              One rated attempt starts everything: readiness per target firm, module bars,
              accuracy by week, and the streak calendar.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/study">
                <Button>Start a drill</Button>
              </Link>
              <Link href="/learn">
                <Button variant="outline">Browse modules</Button>
              </Link>
            </div>
          </div>
        </div>
      </PaperSheet>
    )
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border pb-6">
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Total attempts</p>
          <p className="mt-1 font-display text-3xl tracking-tight">{progress?.total_attempts ?? 0}</p>
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Streak</p>
          <p className="mt-1">
            {(progress?.streak_days ?? 0) > 0 ? (
              <SemanticPill tone="streak">{progress?.streak_days} days</SemanticPill>
            ) : (
              <span className="font-display text-3xl tracking-tight">—</span>
            )}
          </p>
        </div>
        {weakTopics.length > 0 ? (
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">Weak topics</p>
            <p className="mt-1 font-display text-3xl tracking-tight">{weakTopics.length}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Firm readiness
          </h2>
          <Link
            href="/prep/heat"
            className="text-sm text-foreground underline-offset-4 hover:underline"
          >
            Heat ∩ weakness · {weakTopics.length} weak →
          </Link>
        </div>
        {readinessRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pick target firms in{" "}
            <Link href="/settings" className="text-foreground underline-offset-4 hover:underline">
              Settings
            </Link>{" "}
            to score readiness against their hot topics.
          </p>
        ) : (
          <ul className="space-y-4">
            {readinessRows.map((row) => (
              <li key={row.firmId} className="border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 font-medium">
                    {firmNames.get(row.firmId) ?? row.firmId.replace(/^firm_/, "").replace(/-/g, " ")}
                  </p>
                  {row.percent === null ? (
                    <span className="text-sm text-muted-foreground">
                      No hot topics with labs yet
                    </span>
                  ) : (
                    <>
                      <span className="font-display text-2xl tracking-tight tabular-nums">
                        {row.percent}%
                      </span>
                      <SemanticPill tone={readinessTier(row.percent).tone}>
                        {readinessTier(row.percent).label}
                      </SemanticPill>
                    </>
                  )}
                </div>
                {row.hotTopics.length > 0 ? (
                  <HeatStrip
                    compact
                    className="mt-3"
                    entries={row.hotTopics.slice(0, 6).map((topic) => ({
                      topic: topic.topic_id,
                      intensity: topic.intensity,
                      sampleSize: topic.sample_size,
                      weak: weakTopicSet.has(topic.topic_id),
                    }))}
                  />
                ) : null}
                {row.percent !== null && row.conceptIds.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Average mastery across{" "}
                    {row.hotTopics
                      .filter((topic) => conceptIdForTopic(topic.topic_id) !== null)
                      .slice(0, 4)
                      .map((topic) => topicLabel(topic.topic_id))
                      .join(" · ")}{" "}
                    — the concepts behind this firm&apos;s hot topics.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Learn module progress
        </h2>
        <ul className="space-y-3">
          {moduleRows.map(({ module, percent, done, total }) => (
            <li key={module.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link
                  href={`/learn/${module.slug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {module.title}
                </Link>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {done}/{total} checkpoints · {percent}%
                </span>
              </div>
              <div
                className="mt-1.5 h-3 border border-ink bg-paper"
                role="meter"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${module.title} completion`}
              >
                <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Accuracy by week
        </h2>
        {(progress?.accuracy ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rated attempts yet — accuracy appears after your first graded week.
          </p>
        ) : (
          <ul className="space-y-2">
            {(progress?.accuracy ?? []).map((row) => {
              const percent = row.accuracy === null ? null : Math.round(row.accuracy * 100)
              return (
                <li key={row.week} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDate(row.week)}
                  </span>
                  <span className="h-3 flex-1 border border-ink bg-paper" aria-hidden>
                    {percent !== null ? (
                      <span className="block h-full bg-ink" style={{ width: `${percent}%` }} />
                    ) : null}
                  </span>
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {percent === null ? "—" : `${percent}%`} · n={row.attempts}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Study frequency · last 28 days
          </h2>
          <p className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span className="mr-1">attempts</span>
            {[0, 1, 2, 3, 4].map((band) => (
              <span
                key={band}
                className={`inline-flex size-4 items-center justify-center border border-black/15 ${HEAT_CELL_CLASSES[band]}`}
              >
                {band === 4 ? "+" : band}
              </span>
            ))}
          </p>
        </div>
        <div className="space-y-1.5">
          {weeks.map((week, index) => {
            const isCurrent = week.some((day) => day.key === todayKey)
            const cells = (
              <div className="grid grid-cols-7 gap-1.5">
                {week.map((day) => (
                  <span
                    key={day.key}
                    title={`${day.key} · ${day.attempts} attempt${day.attempts === 1 ? "" : "s"}`}
                    aria-label={`${day.key}: ${day.attempts} attempts`}
                    className={`flex h-8 items-center justify-center border border-black/15 font-mono text-[10px] ${HEAT_CELL_CLASSES[attemptsBand(day.attempts)]}`}
                  >
                    {day.attempts > 0 ? day.attempts : day.dayOfMonth}
                  </span>
                ))}
              </div>
            )
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">
                  w{index + 1}
                </span>
                <div className="flex-1">
                  {isCurrent ? (
                    <Annotate type="circle" color="var(--ink)" padding={3}>
                      {cells}
                    </Annotate>
                  ) : (
                    cells
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Current week circled; cell numbers are attempt counts (day-of-month when quiet).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Session history
        </h2>
        {(progress?.sessions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(progress?.sessions ?? []).slice(0, 8).map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {(session.mode ?? "session").replace(/_/g, " ")}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {session.firm_id
                    ? (firmNames.get(session.firm_id) ??
                      session.firm_id.replace(/^firm_/, "").replace(/-/g, " "))
                    : "All firms"}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDateTime(session.started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {weakTopics.length > 0 ? (
        <WarrenCallout mood="thinking" bracket size={48}>
          Weakest right now: {weakTopics.slice(0, 3).map((weak) => topicLabel(weak.topic)).join(" · ")}
          . The heat compare shows exactly where they collide with your targets.
        </WarrenCallout>
      ) : null}
    </div>
  )
}
