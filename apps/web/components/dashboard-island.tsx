"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { TargetSelectIsland, fetchFirmOptions, readStoredTargets } from "@/components/target-select-island"
import { TopicHeatIsland } from "@/components/topic-heat-island"
import {
  CircledNumber,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import { topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery, type WeakTopic } from "@/lib/weak-topics"

type MasteryItem = { score: number; subject_id: string; subject_type: string }

type DashboardData = {
  mastery: MasteryItem[]
  planItems: Array<{ kind: string; id: string; due_at?: string | null }>
  modules: Array<{ slug: string; title: string; checkpoints?: unknown[] }>
  weakTopics: WeakTopic[]
  interviewDate: string | null
  streakDays: number
}

export function DashboardIsland() {
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<Map<string, { name: string; slug: string }>>(new Map())
  const [mode, setMode] = React.useState<"company_prep" | "concept_learn">("company_prep")
  const [data, setData] = React.useState<DashboardData>({
    mastery: [],
    planItems: [],
    modules: [],
    weakTopics: [],
    interviewDate: null,
    streakDays: 0,
  })

  React.useEffect(() => {
    setTargets(readStoredTargets())
    void fetchFirmOptions().then((options) => {
      setFirmNames(
        new Map(options.map((firm) => [firm.id, { name: firm.name, slug: firm.id.replace(/^firm_/, "") }])),
      )
    })
    const controller = new AbortController()
    const json = async (response: Response) => (response.ok ? response.json() : {})
    Promise.all([
      fetch("/api/mastery", { signal: controller.signal }).then(json),
      fetch("/api/study-plan", { signal: controller.signal }).then(json),
      fetch("/api/learn/modules", { signal: controller.signal }).then(json),
      fetch("/api/profile", { signal: controller.signal }).then(json),
      fetch("/api/progress", { signal: controller.signal }).then(json),
    ])
      .then(([masteryPayload, planPayload, modulePayload, profilePayload, progressPayload]: any[]) => {
        const mastery = (masteryPayload.items ?? []) as MasteryItem[]
        setData({
          mastery,
          planItems: (planPayload.plan?.items ?? []) as DashboardData["planItems"],
          modules: (modulePayload.items ?? []) as DashboardData["modules"],
          weakTopics: weakTopicsFromMastery(
            mastery.map((item) => ({
              subject_type: item.subject_type as "concept",
              subject_id: item.subject_id,
              score: item.score,
            })),
          ),
          interviewDate: (profilePayload.profile?.interview_date ?? null) as string | null,
          streakDays: (progressPayload.streak_days ?? 0) as number,
        })
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[dashboard] Summary data unavailable", error)
        }
      })
    return () => controller.abort()
  }, [])

  const primary = targets[0] ? firmNames.get(targets[0]) : undefined
  const weakCount = data.mastery.filter((item) => item.score < 0.68).length
  const averageMastery = data.mastery.length
    ? Math.round((data.mastery.reduce((sum, item) => sum + item.score, 0) / data.mastery.length) * 100)
    : null
  const daysUntil = data.interviewDate
    ? Math.max(0, Math.ceil((Date.parse(`${data.interviewDate}T00:00:00Z`) - Date.now()) / 86_400_000))
    : null
  const weakest = data.weakTopics[0]
  const suggestedReason = weakest
    ? `${primary?.name ?? "Your target"} heat ∩ your ${topicLabel(weakest.topic)} weakness (${Math.round(weakest.score * 100)}% mastery)`
    : data.mastery.length === 0
      ? "No mastery records yet — a grounded pack builds your first weakness signal"
      : "All tracked concepts are at proficient level — keep cadence with a fresh pack"

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Home · what to learn next
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">
            {mode === "company_prep" ? "Company prep" : "Learn"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Active mode">
          <Button
            type="button"
            size="sm"
            variant={mode === "company_prep" ? "default" : "outline"}
            onClick={() => setMode("company_prep")}
          >
            Company prep
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "concept_learn" ? "default" : "outline"}
            onClick={() => setMode("concept_learn")}
          >
            Learn
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Target companies
            </h2>
            <SemanticPill tone="neutral" icon={false}>
              {targets.length} selected
            </SemanticPill>
          </div>
          <TargetSelectIsland value={targets} onChange={setTargets} syncSearchParam />
          <TopicHeatIsland firmIds={targets} />
          <Link
            href="/prep/heat"
            className="inline-block text-sm text-foreground underline-offset-4 hover:underline"
          >
            Open full heat compare →
          </Link>

          <section className="space-y-3 border-t border-border pt-5">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Today&apos;s plan peek
            </h2>
            {data.planItems.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {data.planItems.slice(0, 4).map((item, index) => (
                  <li key={`${item.kind}-${item.id}-${index}`} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {item.kind}
                    </span>
                    <span className="truncate">{item.id.replace(/^(module_|concept_|q_)/, "").replace(/[-_]/g, " ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No assignments yet — open the roadmap to build today&apos;s mix of firm drills and
                module checkpoints.
              </p>
            )}
            <Link href="/plan" className="inline-block text-sm text-foreground underline-offset-4 hover:underline">
              Open roadmap →
            </Link>
          </section>
        </section>

        <aside className="space-y-8 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Mastery</p>
              <p className="mt-1 font-display text-3xl tracking-tight">
                {averageMastery === null ? "—" : `${averageMastery}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weak records</p>
              <p className="mt-1 font-display text-3xl tracking-tight">{weakCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days to interview</p>
              <p className="mt-1 font-display text-3xl tracking-tight">
                {daysUntil === null ? "—" : daysUntil}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Streak</p>
              <p className="mt-1">
                {data.streakDays > 0 ? (
                  <SemanticPill tone="streak">{data.streakDays} days</SemanticPill>
                ) : (
                  <span className="font-display text-3xl tracking-tight">—</span>
                )}
              </p>
            </div>
          </div>

          {weakest ? (
            <section className="space-y-2">
              <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Weak-topic spotlight
              </h2>
              <SemanticPill tone="weak">{topicLabel(weakest.topic)}</SemanticPill>
              <p className="text-sm text-muted-foreground">{weakest.reason}</p>
            </section>
          ) : null}

          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Suggested next
            </p>
            <p className="font-display text-2xl leading-snug tracking-tight">
              {mode === "company_prep"
                ? `Grounded pack for ${primary?.name ?? "your targets"}`
                : (data.modules[0]?.title ?? "Choose a learning module")}
            </p>
            <WarrenCallout mood="thinking" bracket size={48}>
              {suggestedReason}.
            </WarrenCallout>
            <div className="flex flex-wrap gap-2">
              <Link href="/prep/rag">
                <Button>Start pseudo-RAG</Button>
              </Link>
              <Link href="/study">
                <Button variant="outline">Weak-topic drill</Button>
              </Link>
              {mode === "concept_learn" ? (
                <Link href={data.modules[0] ? `/learn/${data.modules[0].slug}` : "/learn"}>
                  <Button variant="ghost">Open Learn</Button>
                </Link>
              ) : primary ? (
                <Link href={`/companies/${primary.slug}`}>
                  <Button variant="ghost">Company room</Button>
                </Link>
              ) : null}
            </div>
          </div>

          <nav aria-label="Shortcuts" className="space-y-1 border-t border-border pt-4 text-sm">
            <Link className="block text-muted-foreground hover:text-foreground" href="/simulator">
              Interview simulator →
            </Link>
            <Link className="block text-muted-foreground hover:text-foreground" href="/learn">
              Learn catalog →
            </Link>
            <Link className="block text-muted-foreground hover:text-foreground" href="/progress">
              Progress →
            </Link>
          </nav>
        </aside>
      </div>

      {daysUntil !== null && daysUntil <= 14 ? (
        <div className="flex items-center gap-4 border-t border-border pt-6">
          <CircledNumber value={String(daysUntil)} label="days remaining" size="sm" />
          <p className="max-w-md text-sm text-muted-foreground">
            Interview is close — the roadmap front-loads weak-topic drills in your hottest firm
            topics. Calm, steady reps beat cramming.
          </p>
        </div>
      ) : null}
    </div>
  )
}
