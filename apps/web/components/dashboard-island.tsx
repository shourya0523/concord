"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import {
  TargetSelectIsland,
  fetchFirmOptions,
  readStoredTargets,
} from "@/components/target-select-island"
import { HeatCompareViews } from "@/components/heat-compare-views"
import {
  Annotate,
  CircledNumber,
  HeatStrip,
  InkHoverScope,
  PaperSheet,
  RoughHover,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import { conceptIdForTopic, topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery, type WeakTopic } from "@/lib/weak-topics"

type MasteryItem = { score: number; subject_id: string; subject_type: string }

type DashboardData = {
  mastery: MasteryItem[]
  planItems: Array<{ kind: string; id: string; due_at?: string | null }>
  modules: Array<{ slug: string; title: string; checkpoints?: unknown[] }>
  weakTopics: WeakTopic[]
  interviewDate: string | null
  streakDays: number
  loadedAtMs: number
}

type HeatPayload = {
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

type MasteryPayload = { items?: MasteryItem[] }
type PlanPayload = { plan?: { items?: DashboardData["planItems"] } }
type ModulePayload = { items?: DashboardData["modules"] }
type ProfilePayload = { profile?: { interview_date?: string | null } }
type ProgressPayload = { streak_days?: number }

const HOT_THRESHOLD = 0.5

function readinessTier(percent: number): { label: string; tone: "milestone" } {
  if (percent < 40) return { label: "Needs work", tone: "milestone" }
  if (percent < 70) return { label: "Building", tone: "milestone" }
  return { label: "Ready", tone: "milestone" }
}

function urgencyCopy(days: number): { label: string; detail: string } {
  if (days <= 7) {
    return {
      label: "Final stretch",
      detail:
        "Front-load weak-topic drills in the hottest target-firm topics today.",
    }
  }
  if (days <= 14) {
    return {
      label: "Close window",
      detail:
        "Keep the roadmap tight: one company pack, one weak concept, one calm review loop.",
    }
  }
  if (days <= 30) {
    return {
      label: "Build cadence",
      detail:
        "Use the runway for prereq modules now so final weeks can stay firm-specific.",
    }
  }
  return {
    label: "Date set",
    detail:
      "The roadmap can pace modules, weak topics, and firm drills against your interview.",
  }
}

export function DashboardIsland() {
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<
    Map<string, { name: string; slug: string }>
  >(new Map())
  const [mode, setMode] = React.useState<"company_prep" | "concept_learn">(
    "company_prep"
  )
  const [heatTopics, setHeatTopics] = React.useState<HeatPayload["topics"]>([])
  const [data, setData] = React.useState<DashboardData>({
    mastery: [],
    planItems: [],
    modules: [],
    weakTopics: [],
    interviewDate: null,
    streakDays: 0,
    loadedAtMs: 0,
  })

  React.useEffect(() => {
    const targetTimer = window.setTimeout(
      () => setTargets(readStoredTargets()),
      0
    )
    void fetchFirmOptions().then((options) => {
      setFirmNames(
        new Map(
          options.map((firm) => [
            firm.id,
            { name: firm.name, slug: firm.id.replace(/^firm_/, "") },
          ])
        )
      )
    })
    const controller = new AbortController()
    const json = async <T,>(response: Response): Promise<T | null> =>
      response.ok ? ((await response.json()) as T) : null
    Promise.all([
      fetch("/api/mastery", { signal: controller.signal }).then((response) =>
        json<MasteryPayload>(response)
      ),
      fetch("/api/study-plan", { signal: controller.signal }).then((response) =>
        json<PlanPayload>(response)
      ),
      fetch("/api/learn/modules", { signal: controller.signal }).then(
        (response) => json<ModulePayload>(response)
      ),
      fetch("/api/profile", { signal: controller.signal }).then((response) =>
        json<ProfilePayload>(response)
      ),
      fetch("/api/progress", { signal: controller.signal }).then((response) =>
        json<ProgressPayload>(response)
      ),
    ])
      .then(
        ([
          masteryPayload,
          planPayload,
          modulePayload,
          profilePayload,
          progressPayload,
        ]) => {
          const mastery = masteryPayload?.items ?? []
          setData({
            mastery,
            planItems: planPayload?.plan?.items ?? [],
            modules: modulePayload?.items ?? [],
            weakTopics: weakTopicsFromMastery(
              mastery.map((item) => ({
                subject_type: item.subject_type as "concept",
                subject_id: item.subject_id,
                score: item.score,
              }))
            ),
            interviewDate: profilePayload?.profile?.interview_date ?? null,
            streakDays: progressPayload?.streak_days ?? 0,
            loadedAtMs: Date.now(),
          })
        }
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[dashboard] Summary data unavailable", error)
        }
      })
    return () => {
      window.clearTimeout(targetTimer)
      controller.abort()
    }
  }, [])

  React.useEffect(() => {
    if (targets.length === 0) {
      return
    }
    const controller = new AbortController()
    const params = targets
      .map((id) => `firm_id=${encodeURIComponent(id)}`)
      .join("&")
    fetch(`/api/prep/heat?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { topics: [] }
        return (await response.json()) as HeatPayload
      })
      .then((payload) => setHeatTopics(payload.topics ?? []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setHeatTopics([])
        }
      })
    return () => controller.abort()
  }, [targets])

  const primary = targets[0] ? firmNames.get(targets[0]) : undefined
  const weakCount = data.mastery.filter((item) => item.score < 0.68).length
  const averageMastery = data.mastery.length
    ? Math.round(
        (data.mastery.reduce((sum, item) => sum + item.score, 0) /
          data.mastery.length) *
          100
      )
    : null
  const daysUntil =
    data.interviewDate && data.loadedAtMs > 0
      ? Math.max(
          0,
          Math.ceil(
            (Date.parse(`${data.interviewDate}T00:00:00Z`) - data.loadedAtMs) /
              86_400_000
          )
        )
      : null
  const weakest = data.weakTopics[0]
  const masteryByConcept = new Map(
    data.mastery
      .filter((item) => item.subject_type === "concept")
      .map((item) => [item.subject_id, item.score])
  )
  const weakTopicSet = new Set(data.weakTopics.map((weak) => weak.topic))
  const readinessRows = targets.map((firmId) => {
    const hotTopics = heatTopics.filter(
      (row) =>
        row.firm_id === firmId &&
        row.intensity >= HOT_THRESHOLD &&
        row.topic_id !== "untagged"
    )
    const conceptIds = [
      ...new Set(
        hotTopics
          .map((row) => conceptIdForTopic(row.topic_id))
          .filter((id): id is string => id !== null)
      ),
    ]
    const percent =
      conceptIds.length === 0
        ? null
        : Math.round(
            (conceptIds.reduce(
              (sum, id) => sum + (masteryByConcept.get(id) ?? 0),
              0
            ) /
              conceptIds.length) *
              100
          )
    return { firmId, hotTopics, conceptIds, percent }
  })
  const urgency = daysUntil === null ? null : urgencyCopy(daysUntil)
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
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Active mode"
        >
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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.85fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Target companies
            </h2>
            <SemanticPill tone="neutral" icon={false}>
              {targets.length} selected
            </SemanticPill>
          </div>
          <TargetSelectIsland
            value={targets}
            onChange={setTargets}
            syncSearchParam
          />
          <HeatCompareViews
            firmIds={targets}
            showInsights={false}
            activateTarget="company"
            idPrefix="dashboard-heat"
          />
          <Link
            href="/prep/heat"
            className="inline-block text-sm text-foreground underline-offset-4 hover:underline"
          >
            <RoughHover>Open full heat compare →</RoughHover>
          </Link>

          <section className="mt-2 border border-border bg-background/30 px-4 py-4">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Today&apos;s plan peek
            </h2>
            {data.planItems.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.planItems.slice(0, 4).map((item, index) => (
                  <li
                    key={`${item.kind}-${item.id}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {item.kind}
                    </span>
                    <span className="truncate">
                      {item.id
                        .replace(/^(module_|concept_|q_)/, "")
                        .replace(/[-_]/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No assignments yet — open the roadmap to build today&apos;s mix
                of firm drills and module checkpoints.
              </p>
            )}
            <Link
              href="/plan"
              className="mt-3 inline-block text-sm text-foreground underline-offset-4 hover:underline"
            >
              <RoughHover>Open roadmap →</RoughHover>
            </Link>
          </section>
        </section>

        <aside className="min-w-0 space-y-8 border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
          {daysUntil !== null && urgency ? (
            <section className="flex items-center gap-4 border border-ink/20 bg-streak/10 px-4 py-4">
              <CircledNumber
                value={String(daysUntil)}
                label="days left"
                size="sm"
              />
              <div className="min-w-0 space-y-1">
                <SemanticPill tone={daysUntil <= 14 ? "streak" : "milestone"}>
                  {urgency.label}
                </SemanticPill>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {urgency.detail}
                </p>
              </div>
            </section>
          ) : (
            <section className="border border-border px-4 py-3 text-sm text-muted-foreground">
              Add an interview date in{" "}
              <Link
                href="/settings"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Settings
              </Link>{" "}
              to pace your roadmap.
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Firm readiness
              </h2>
              <Link
                href="/progress"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Full progress →
              </Link>
            </div>
            {readinessRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select targets to score readiness against each firm&apos;s
                hot-topic labs.
              </p>
            ) : (
              <ul className="space-y-3">
                {readinessRows.map((row) => {
                  const firm = firmNames.get(row.firmId)
                  const tier =
                    row.percent === null ? null : readinessTier(row.percent)
                  return (
                    <li
                      key={row.firmId}
                      className="border border-border bg-milestone/10 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {firm?.name ??
                            row.firmId.replace(/^firm_/, "").replace(/-/g, " ")}
                        </span>
                        {row.percent === null ? (
                          <SemanticPill tone="neutral" icon={false}>
                            score —
                          </SemanticPill>
                        ) : (
                          <>
                            <span className="font-display text-2xl leading-none tracking-tight tabular-nums">
                              {row.percent}%
                            </span>
                            <SemanticPill tone={tier!.tone}>
                              {tier!.label}
                            </SemanticPill>
                          </>
                        )}
                      </div>
                      {row.hotTopics.length > 0 ? (
                        <HeatStrip
                          compact
                          className="mt-3"
                          entries={row.hotTopics.slice(0, 4).map((topic) => ({
                            topic: topic.topic_id,
                            intensity: topic.intensity,
                            sampleSize: topic.sample_size,
                            weak: weakTopicSet.has(topic.topic_id),
                          }))}
                        />
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No hot topics with mapped concept labs yet.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Mastery</p>
              <p className="mt-1 font-display text-3xl tracking-tight">
                {averageMastery === null ? "—" : `${averageMastery}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weak records</p>
              <p className="mt-1 font-display text-3xl tracking-tight">
                {weakCount}
              </p>
            </div>
          </div>

          <section className="inline-flex items-center gap-4 border border-ink/20 bg-streak/10 px-4 py-3 hover:-translate-y-0.5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-reduce:transform-none">
            <CircledNumber
              value={String(data.streakDays)}
              label="day streak"
              size="sm"
            />
            <div className="space-y-1">
              <SemanticPill tone="streak">
                {data.streakDays > 0 ? "active streak" : "start streak"}
              </SemanticPill>
              <p className="text-xs text-muted-foreground">
                Keep one calm rep moving each day.
              </p>
            </div>
          </section>

          {weakest ? (
            <section className="space-y-2">
              <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Weak-topic spotlight
              </h2>
              <SemanticPill tone="weak">
                {topicLabel(weakest.topic)}
              </SemanticPill>
              <p className="text-sm text-muted-foreground">{weakest.reason}</p>
            </section>
          ) : null}

          <PaperSheet seedKey="dashboard-suggested-next">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Suggested next
            </p>
            <p className="mt-2 font-display text-2xl leading-snug tracking-tight">
              <Annotate type="underline" color="var(--ink)" padding={2}>
                {mode === "company_prep"
                  ? `Grounded pack for ${primary?.name ?? "your targets"}`
                  : (data.modules[0]?.title ?? "Choose a learning module")}
              </Annotate>
            </p>
            <div className="mt-3">
              <WarrenCallout mood="thinking" bracket size={48}>
                {suggestedReason}.
              </WarrenCallout>
            </div>
            <InkHoverScope className="mt-4 flex flex-wrap gap-2">
              <Link href="/prep/rag">
                <Button>Start pseudo-RAG</Button>
              </Link>
              <Link href="/study">
                <Button variant="outline">Weak-topic drill</Button>
              </Link>
              {mode === "concept_learn" ? (
                <Link
                  href={
                    data.modules[0]
                      ? `/learn/${data.modules[0].slug}`
                      : "/learn"
                  }
                >
                  <Button variant="ghost">Open Learn</Button>
                </Link>
              ) : primary ? (
                <Link href={`/companies/${primary.slug}`}>
                  <Button variant="ghost">Company room</Button>
                </Link>
              ) : null}
            </InkHoverScope>
          </PaperSheet>

          <nav
            aria-label="Shortcuts"
            className="space-y-1 border-t border-border pt-4 text-sm"
          >
            <Link
              className="block text-muted-foreground hover:text-foreground"
              href="/simulator"
            >
              <RoughHover>Interview simulator →</RoughHover>
            </Link>
            <Link
              className="block text-muted-foreground hover:text-foreground"
              href="/learn"
            >
              <RoughHover>Learn catalog →</RoughHover>
            </Link>
            <Link
              className="block text-muted-foreground hover:text-foreground"
              href="/progress"
            >
              <RoughHover>Progress →</RoughHover>
            </Link>
          </nav>
        </aside>
      </div>
    </div>
  )
}
