"use client"

/**
 * /drills — numeric drill catalogue grouped by concept, and an in-page runner
 * (plan 2026-09-23-001 P2.8). Every drill is seeded and graded exactly by
 * the finance calculators; "Mixed" lets the server lean on weak concepts.
 */
import * as React from "react"
import Link from "next/link"

import type { DrillInstance } from "@ibpe/contracts"
import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { cn } from "@ibpe/ui/lib/utils"

import { DrillCard } from "@/components/drill-card"
import { SemanticPill, WarrenCallout } from "@/components/paper"
import type {
  DrillAttemptResponse,
  DrillNextResponse,
  DrillTemplateSummary,
  DrillTemplatesResponse,
} from "@/lib/api/drill-schemas"
import { topicLabel } from "@/lib/topics"

type Phase = "loading" | "ready" | "unauthenticated" | "error"
type Mode = { kind: "template"; id: string } | { kind: "mixed"; concept?: string }

const CONCEPT_LABELS: Record<string, string> = {
  concept_accounting_foundations: "Accounting & the three statements",
  concept_ev_equity_value: "Enterprise value, equity value & comps",
  concept_dcf_wacc: "DCF, WACC & free cash flow",
  concept_lbo_paper_lbo: "LBOs & returns",
}

const CONCEPT_ORDER = [
  "concept_accounting_foundations",
  "concept_ev_equity_value",
  "concept_dcf_wacc",
  "concept_lbo_paper_lbo",
]

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const

type Group = { key: string; label: string; concept: string | null; items: DrillTemplateSummary[] }

function groupTemplates(items: DrillTemplateSummary[]): Group[] {
  const groups = new Map<string, Group>()
  for (const item of items) {
    const key = item.concept_id ?? `topic:${item.topic}`
    const group = groups.get(key) ?? {
      key,
      label: item.concept_id ? CONCEPT_LABELS[item.concept_id] ?? item.concept_id : topicLabel(item.topic),
      concept: item.concept_id,
      items: [],
    }
    group.items.push(item)
    groups.set(key, group)
  }
  const rank = (g: Group) => {
    const i = g.concept ? CONCEPT_ORDER.indexOf(g.concept) : -1
    return i === -1 ? 99 : i
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      items: [...g.items].sort(
        (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title),
      ),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

function readInitialMode(): Mode | null {
  if (typeof window === "undefined") return null
  const params = new URLSearchParams(window.location.search)
  const template = params.get("template")
  if (template && /^[a-z0-9_]+$/.test(template)) return { kind: "template", id: template }
  const concept = params.get("concept")
  if (concept) return { kind: "mixed", concept }
  return null
}

export function DrillsIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [templates, setTemplates] = React.useState<DrillTemplateSummary[]>([])
  const [mode, setMode] = React.useState<Mode | null>(null)
  const [drill, setDrill] = React.useState<DrillInstance | null>(null)
  const [drillNote, setDrillNote] = React.useState<string | null>(null)
  const [loadingDrill, setLoadingDrill] = React.useState(false)
  const [session, setSession] = React.useState({ attempts: 0, correct: 0 })
  const runnerRef = React.useRef<HTMLDivElement>(null)

  const loadDrill = React.useCallback(async (next: Mode) => {
    setMode(next)
    setLoadingDrill(true)
    setDrillNote(null)
    try {
      const params = new URLSearchParams()
      if (next.kind === "template") params.set("template", next.id)
      if (next.kind === "mixed" && next.concept) params.set("concept", next.concept)
      const res = await fetch(`/api/drills/next?${params.toString()}`, { cache: "no-store" })
      if (res.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!res.ok) {
        setDrillNote("Could not load a drill — try again.")
        return
      }
      const payload = (await res.json()) as DrillNextResponse
      setDrill(payload.drill)
      setDrillNote(payload.note ?? null)
      requestAnimationFrame(() => runnerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    } catch {
      setDrillNote("Network error loading the drill.")
    } finally {
      setLoadingDrill(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch("/api/drills/templates", { signal: controller.signal, cache: "no-store" })
        if (res.status === 401) {
          setPhase("unauthenticated")
          return
        }
        if (!res.ok) {
          setPhase("error")
          return
        }
        const payload = (await res.json()) as DrillTemplatesResponse
        setTemplates(payload.items)
        setPhase("ready")
        const initial = readInitialMode()
        if (initial) void loadDrill(initial)
      } catch (err) {
        if ((err as Error).name !== "AbortError") setPhase("error")
      }
    })()
    return () => controller.abort()
  }, [loadDrill])

  const onGraded = React.useCallback((result: DrillAttemptResponse) => {
    setSession((s) => ({ attempts: s.attempts + 1, correct: s.correct + (result.correct ? 1 : 0) }))
    const templateId = result.drill_id.split(":")[1]
    setTemplates((items) =>
      items.map((t) =>
        t.id === templateId
          ? {
              ...t,
              attempts: t.attempts + 1,
              correct: t.correct + (result.correct ? 1 : 0),
              last_attempt_at: new Date().toISOString(),
            }
          : t,
      ),
    )
  }, [])

  const groups = React.useMemo(() => groupTemplates(templates), [templates])
  const activeTemplate = drill ? templates.find((t) => t.id === drill.template_id) : null

  if (phase === "loading") {
    return <p className="text-sm text-muted-foreground" aria-live="polite">Loading drills…</p>
  }
  if (phase === "unauthenticated") {
    return (
      <WarrenCallout>
        Numeric drills save your results to your readiness.{" "}
        <Link href="/sign-in?next=/drills" className="underline underline-offset-4">
          Sign in
        </Link>{" "}
        to start.
      </WarrenCallout>
    )
  }
  if (phase === "error") {
    return (
      <p role="alert" className="text-sm text-error-foreground">
        Could not load the drill catalogue. Refresh to try again.
      </p>
    )
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-6 lg:order-1 order-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void loadDrill({ kind: "mixed" })}>
            Mixed drill
          </Button>
          <p className="text-xs text-muted-foreground">Leans toward your weaker concepts.</p>
        </div>

        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`drill-group-${group.key}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1">
              <h2 id={`drill-group-${group.key}`} className="font-display text-xl tracking-tight">
                {group.label}
              </h2>
              {group.concept ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => void loadDrill({ kind: "mixed", concept: group.concept as string })}
                >
                  Mix this concept
                </button>
              ) : null}
            </div>
            <ul className="divide-y divide-border/70">
              {group.items.map((t) => {
                const active = drill?.template_id === t.id
                return (
                  <li key={t.id} className={cn("flex items-start gap-3 py-3", active && "bg-secondary/60 -mx-2 px-2")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{t.title}</span>
                        <MetadataPill>{t.difficulty}</MetadataPill>
                        {t.unit ? <MetadataPill tone="muted">{t.unit}</MetadataPill> : null}
                      </div>
                      {t.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {t.attempts === 0 ? "Not tried yet" : `${t.correct}/${t.attempts} correct`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      aria-label={`Start ${t.title} drill`}
                      onClick={() => void loadDrill({ kind: "template", id: t.id })}
                    >
                      Start
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <div ref={runnerRef} className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {session.attempts > 0 ? (
            <SemanticPill tone={session.correct === session.attempts ? "success" : "neutral"}>
              This session {session.correct}/{session.attempts}
            </SemanticPill>
          ) : null}
          {activeTemplate ? (
            <span className="text-sm text-muted-foreground">
              {mode?.kind === "mixed" ? "Mixed · " : ""}
              {activeTemplate.title}
            </span>
          ) : null}
          {drillNote ? <span className="text-xs text-muted-foreground">{drillNote}</span> : null}
        </div>

        {drill ? (
          <DrillCard
            key={drill.id}
            drill={drill}
            onGraded={onGraded}
            onNext={() => void loadDrill(mode ?? { kind: "template", id: drill.template_id })}
          />
        ) : (
          <WarrenCallout>
            Pick a drill and press <strong>Start</strong>. Each one is freshly generated with banker-style
            numbers, checked exactly, and followed by the worked solution. Mental math first — then check.
          </WarrenCallout>
        )}
        {loadingDrill ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Generating a drill…
          </p>
        ) : null}
      </div>
    </div>
  )
}
