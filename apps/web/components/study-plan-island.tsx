"use client"

import * as React from "react"
import Link from "next/link"
import { Check } from "lucide-react"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import {
  Annotate,
  CircledNumber,
  PaperSheet,
  SemanticPill,
  Warren,
  WarrenCallout,
} from "@/components/paper"
import {
  fetchFirmOptions,
  readStoredTargets,
} from "@/components/target-select-island"
import { topicLabel } from "@/lib/topics"
import { weakTopicsFromMastery, type WeakTopic } from "@/lib/weak-topics"

/**
 * Study plan / learning roadmap (DESIGN.md §10.10).
 *
 * The study-plan API persists items with the contract enum
 * (question/concept/resource/diagram/module/module_checkpoint). Roadmap
 * display kinds map onto it: company drills persist as kind "question" with
 * id `firm-drill:{firmId}:{topic}`, the mock slot as kind "resource" with id
 * `mock:simulator`. Completion for non-module items overlays in localStorage
 * (server progress covers module + checkpoint items); toggles re-PUT the
 * plan and only celebrate once the save confirms.
 */

type PlanItemKind =
  | "question"
  | "concept"
  | "resource"
  | "diagram"
  | "module"
  | "module_checkpoint"

type PlanItem = {
  kind: PlanItemKind
  id: string
  due_at?: string | null
}

type StudyPlanPayload = {
  plan: {
    title: string
    learning_mode: "company_prep" | "concept_learn"
    firm_ids: string[]
    concept_ids: string[]
    weak_topic_ids: string[]
    items: PlanItem[]
  }
  source: string
  note?: string
}

type ModuleItem = {
  id: string
  slug: string
  title: string
  estimated_minutes?: number
  concept_ids: string[]
  prereq_module_ids?: string[]
  checkpoints: Array<{
    id: string
    kind: string
    title: string
    position: number
    concept_id?: string | null
  }>
}

type ConceptEntry = { id: string; slug: string; title: string }

type ProfilePayload = {
  profile: {
    interview_date: string | null
    availability_minutes: number | null
  }
}

type ModuleProgressRow = {
  module_id: string
  percent: number
  completed_checkpoint_ids: string[]
}

type HeatPayload = {
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

type Phase = "loading" | "ready" | "unauthenticated" | "error"

const COMPLETED_STORAGE_KEY = "ibpe.plan.completed.v1"
const MOCK_ITEM_ID = "mock:simulator"
const FIRM_DRILL_PREFIX = "firm-drill:"
/** Rough per-assignment effort for the catch-up heuristic (stated in copy). */
const MINUTES_PER_ASSIGNMENT = 30

function itemKey(item: PlanItem): string {
  return `${item.kind}:${item.id}`
}

function readStoredCompleted(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(COMPLETED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeStoredCompleted(map: Record<string, boolean>) {
  try {
    window.localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // local storage unavailable — completion stays in-memory only
  }
}

/** Prereq-first module ordering (catalog order breaks ties, cycle-safe). */
function orderModulesByPrereq(list: ModuleItem[]): ModuleItem[] {
  const byId = new Map(list.map((module) => [module.id, module]))
  const seen = new Set<string>()
  const out: ModuleItem[] = []
  function visit(module: ModuleItem, guard: Set<string>) {
    if (seen.has(module.id) || guard.has(module.id)) return
    guard.add(module.id)
    for (const prereqId of module.prereq_module_ids ?? []) {
      const prereq = byId.get(prereqId)
      if (prereq) visit(prereq, guard)
    }
    guard.delete(module.id)
    seen.add(module.id)
    out.push(module)
  }
  for (const module of list) visit(module, new Set())
  return out
}

/**
 * Completion derived from real checkpoint ids — the API's percent field is
 * clamped 0..1 while the DB stores 0..100, so checkpoint ids are the honest
 * signal whenever the catalog is available.
 */
function moduleCompletion(
  module: ModuleItem,
  progress: ModuleProgressRow | undefined
): { complete: boolean; ratio: number } {
  if (module.checkpoints.length > 0) {
    const done = progress
      ? module.checkpoints.filter((c) =>
          progress.completed_checkpoint_ids.includes(c.id)
        ).length
      : 0
    const ratio = done / module.checkpoints.length
    return { complete: ratio >= 1, ratio }
  }
  const ratio = progress ? Math.min(1, Math.max(0, progress.percent)) : 0
  return { complete: ratio >= 0.999, ratio }
}

function formatMinutesWeekly(dailyMinutes: number): string {
  const weekly = dailyMinutes * 7
  const hours = Math.floor(weekly / 60)
  const mins = weekly % 60
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

function formatDue(dueAt: string): string {
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function planUrgency(
  days: number,
  overloaded: boolean
): { label: string; detail: string } {
  if (overloaded) {
    return {
      label: "Over budget",
      detail: "Drop to the core path before adding more firm reps.",
    }
  }
  if (days <= 7) {
    return {
      label: "Final stretch",
      detail:
        "Keep only the highest-leverage drills, weak labs, and one mock loop.",
    }
  }
  if (days <= 14) {
    return {
      label: "Close window",
      detail:
        "Prioritize hot firm topics and the next unlocked module checkpoint.",
    }
  }
  if (days <= 30) {
    return {
      label: "Build cadence",
      detail:
        "Use this runway to clear prerequisites before firm-specific reps get dense.",
    }
  }
  return {
    label: "Date set",
    detail:
      "The roadmap can pace modules, concept labs, and mocks against your interview.",
  }
}

export function StudyPlanIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [plan, setPlan] = React.useState<StudyPlanPayload | null>(null)
  const [modules, setModules] = React.useState<ModuleItem[]>([])
  const [concepts, setConcepts] = React.useState<ConceptEntry[]>([])
  const [profile, setProfile] = React.useState<
    ProfilePayload["profile"] | null
  >(null)
  const [loadedAtMs, setLoadedAtMs] = React.useState(0)
  const [moduleProgress, setModuleProgress] = React.useState<
    ModuleProgressRow[]
  >([])
  const [targets, setTargets] = React.useState<string[]>([])
  const [firmNames, setFirmNames] = React.useState<Map<string, string>>(
    new Map()
  )
  const [completedOverlay, setCompletedOverlay] = React.useState<
    Record<string, boolean>
  >({})
  const [building, setBuilding] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savedTick, setSavedTick] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  const load = React.useCallback(async (signal: AbortSignal) => {
    setPhase("loading")
    setLoadError(null)
    const json = async <T,>(
      response: Response
    ): Promise<{ status: number; data: T | null }> => ({
      status: response.status,
      data: response.ok ? ((await response.json()) as T) : null,
    })
    try {
      const [
        planRes,
        moduleRes,
        profileRes,
        conceptRes,
        progressRes,
        targetRes,
      ] = await Promise.all([
        fetch("/api/study-plan", { signal }).then((r) =>
          json<StudyPlanPayload>(r)
        ),
        fetch("/api/learn/modules", { signal }).then((r) =>
          json<{ items: ModuleItem[] }>(r)
        ),
        fetch("/api/profile", { signal }).then((r) => json<ProfilePayload>(r)),
        fetch("/api/concepts", { signal }).then((r) =>
          json<{ items: Array<{ concept: ConceptEntry }> }>(r)
        ),
        fetch("/api/progress", { signal }).then((r) =>
          json<{ module_progress: ModuleProgressRow[] }>(r)
        ),
        fetch("/api/targets", { signal }).then((r) =>
          json<{ target_set?: { firm_ids?: string[] } }>(r)
        ),
      ])

      if (planRes.status === 401 || profileRes.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!planRes.data || !moduleRes.data) {
        setLoadError("The roadmap service is unreachable right now.")
        setPhase("error")
        return
      }

      setPlan(planRes.data)
      setModules(moduleRes.data.items)
      setConcepts((conceptRes.data?.items ?? []).map((entry) => entry.concept))
      setProfile(profileRes.data?.profile ?? null)
      setLoadedAtMs(Date.now())
      setModuleProgress(progressRes.data?.module_progress ?? [])
      const targetIds = targetRes.data?.target_set?.firm_ids
      setTargets(targetIds?.length ? targetIds : readStoredTargets())
      setCompletedOverlay(readStoredCompleted())
      setPhase("ready")
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoadError("The roadmap service is unreachable right now.")
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

  function flashSaved() {
    setSavedTick(true)
    window.setTimeout(() => setSavedTick(false), 2000)
  }

  async function persistItems(
    items: PlanItem[],
    base: StudyPlanPayload
  ): Promise<boolean> {
    const response = await fetch("/api/study-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: base.plan.title,
        learning_mode: base.plan.learning_mode,
        firm_ids: base.plan.firm_ids,
        concept_ids: base.plan.concept_ids,
        weak_topic_ids: base.plan.weak_topic_ids,
        items,
      }),
    })
    if (response.status === 401) {
      setPhase("unauthenticated")
      return false
    }
    if (!response.ok) return false
    setPlan((await response.json()) as StudyPlanPayload)
    return true
  }

  async function buildFromTargets() {
    if (building || saving) return
    setBuilding(true)
    setNotice(null)
    try {
      const firmIds = targets.length > 0 ? targets : readStoredTargets()
      const [masteryPayload, heatPayload] = await Promise.all([
        fetch("/api/mastery")
          .then(async (r) =>
            r.ok
              ? ((await r.json()) as {
                  items?: Array<{
                    subject_type: string
                    subject_id: string
                    score: number
                  }>
                })
              : null
          )
          .catch(() => null),
        firmIds.length > 0
          ? fetch(
              `/api/prep/heat?${firmIds.map((id) => `firm_id=${encodeURIComponent(id)}`).join("&")}`
            )
              .then(async (r) =>
                r.ok ? ((await r.json()) as HeatPayload) : null
              )
              .catch(() => null)
          : Promise.resolve(null),
      ])

      const weakTopics: WeakTopic[] = weakTopicsFromMastery(
        (masteryPayload?.items ?? []).map((item) => ({
          subject_type: item.subject_type as "concept",
          subject_id: item.subject_id,
          score: item.score,
        }))
      )

      const dayMs = 86_400_000
      let dayOffset = 0
      const nextDue = () =>
        new Date(Date.now() + dayOffset++ * dayMs).toISOString()
      const items: PlanItem[] = []

      // 1 · Company drills — hottest heat topic per target firm.
      const topTopicByFirm = new Map<
        string,
        { topic: string; intensity: number }
      >()
      for (const row of heatPayload?.topics ?? []) {
        if (row.topic_id === "untagged") continue
        const current = topTopicByFirm.get(row.firm_id)
        if (!current || row.intensity > current.intensity) {
          topTopicByFirm.set(row.firm_id, {
            topic: row.topic_id,
            intensity: row.intensity,
          })
        }
      }
      for (const firmId of firmIds.slice(0, 3)) {
        const hot = topTopicByFirm.get(firmId)
        if (!hot) continue
        items.push({
          kind: "question",
          id: `${FIRM_DRILL_PREFIX}${firmId}:${hot.topic}`,
          due_at: nextDue(),
        })
      }

      // 2 · Learn module path — first incomplete module in prereq order,
      //     then its first incomplete checkpoint.
      const progressByModule = new Map(
        moduleProgress.map((row) => [row.module_id, row])
      )
      const nextModule = orderModulesByPrereq(modules).find(
        (module) =>
          !moduleCompletion(module, progressByModule.get(module.id)).complete
      )
      if (nextModule) {
        items.push({ kind: "module", id: nextModule.id, due_at: nextDue() })
        const doneIds = new Set(
          progressByModule.get(nextModule.id)?.completed_checkpoint_ids ?? []
        )
        const checkpoint = [...nextModule.checkpoints]
          .sort((a, b) => a.position - b.position)
          .find((candidate) => !doneIds.has(candidate.id))
        if (checkpoint) {
          items.push({
            kind: "module_checkpoint",
            id: checkpoint.id,
            due_at: nextDue(),
          })
        }
      }

      // 3 · Concept labs for weak topics.
      for (const weak of weakTopics.slice(0, 3)) {
        if (!weak.concept_id) continue
        items.push({ kind: "concept", id: weak.concept_id, due_at: nextDue() })
      }

      // 4 · Mock interview slot closes the loop.
      items.push({ kind: "resource", id: MOCK_ITEM_ID, due_at: nextDue() })

      const conceptIds = new Set<string>([
        ...(nextModule?.concept_ids ?? []),
        ...weakTopics.flatMap((weak) =>
          weak.concept_id ? [weak.concept_id] : []
        ),
      ])

      const response = await fetch("/api/study-plan", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Interview study plan",
          learning_mode: "company_prep",
          firm_ids: firmIds,
          concept_ids: [...conceptIds],
          weak_topic_ids: weakTopics.map((weak) => weak.topic),
          items,
        }),
      })
      if (response.status === 401) {
        setPhase("unauthenticated")
        return
      }
      if (!response.ok) {
        setNotice(
          `Roadmap could not be saved (HTTP ${response.status}). Nothing changed.`
        )
        return
      }
      setPlan((await response.json()) as StudyPlanPayload)
      setCompletedOverlay({})
      writeStoredCompleted({})
      flashSaved()
      setNotice(
        firmIds.length === 0
          ? "Roadmap built around modules — add target firms in Settings to schedule company drills."
          : null
      )
    } catch {
      setNotice("Roadmap could not be composed — the network request failed.")
    } finally {
      setBuilding(false)
    }
  }

  async function toggleItem(item: PlanItem, currentlyCompleted: boolean) {
    if (saving || !plan) return
    const key = itemKey(item)
    const previous = completedOverlay
    const next = { ...completedOverlay, [key]: !currentlyCompleted }
    setCompletedOverlay(next)
    writeStoredCompleted(next)
    setSaving(true)
    setNotice(null)
    try {
      const ok = await persistItems(plan.plan.items, plan)
      if (!ok) {
        setCompletedOverlay(previous)
        writeStoredCompleted(previous)
        setNotice("Could not save the roadmap — the change was reverted.")
        return
      }
      flashSaved()
    } catch {
      setCompletedOverlay(previous)
      writeStoredCompleted(previous)
      setNotice("Could not save the roadmap — the change was reverted.")
    } finally {
      setSaving(false)
    }
  }

  async function dropToCore() {
    if (saving || !plan) return
    setSaving(true)
    setNotice(null)
    const core = plan.plan.items.filter(
      (item) =>
        item.kind === "module_checkpoint" ||
        item.kind === "concept" ||
        (item.kind === "resource" && item.id === MOCK_ITEM_ID)
    )
    try {
      const ok = await persistItems(core, plan)
      setNotice(
        ok
          ? "Trimmed to the core set."
          : "Could not trim the roadmap — nothing changed."
      )
      if (ok) flashSaved()
    } catch {
      setNotice("Could not trim the roadmap — nothing changed.")
    } finally {
      setSaving(false)
    }
  }

  const moduleById = new Map(modules.map((module) => [module.id, module]))
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]))
  const checkpointById = new Map(
    modules.flatMap((module) =>
      module.checkpoints.map(
        (checkpoint) => [checkpoint.id, { checkpoint, module }] as const
      )
    )
  )
  const progressByModule = new Map(
    moduleProgress.map((row) => [row.module_id, row])
  )

  function serverCompleted(item: PlanItem): boolean {
    if (item.kind === "module") {
      const module = moduleById.get(item.id)
      if (!module) return false
      return moduleCompletion(module, progressByModule.get(item.id)).complete
    }
    if (item.kind === "module_checkpoint") {
      const entry = checkpointById.get(item.id)
      if (!entry) return false
      return (
        progressByModule
          .get(entry.module.id)
          ?.completed_checkpoint_ids.includes(item.id) ?? false
      )
    }
    return false
  }

  function resolveItem(item: PlanItem): {
    chip: string
    title: string
    href: string
    detail?: string
  } {
    if (item.kind === "module") {
      const module = moduleById.get(item.id)
      return {
        chip: "module",
        title: module?.title ?? item.id,
        href: module ? `/learn/${module.slug}` : "/learn",
        detail: module
          ? `${module.checkpoints.length} checkpoints · prereq-ordered`
          : undefined,
      }
    }
    if (item.kind === "module_checkpoint") {
      const entry = checkpointById.get(item.id)
      return {
        chip: "checkpoint",
        title: entry?.checkpoint.title ?? item.id,
        href: entry ? `/learn/${entry.module.slug}` : "/learn",
        detail: entry ? `Module · ${entry.module.title}` : undefined,
      }
    }
    if (item.kind === "concept") {
      const concept = conceptById.get(item.id)
      return {
        chip: "concept",
        title: concept ? `${concept.title} lab` : item.id,
        href: concept ? `/concepts/${concept.slug}` : "/concepts",
        detail: "Weak-topic concept lab",
      }
    }
    if (item.kind === "question" && item.id.startsWith(FIRM_DRILL_PREFIX)) {
      const [, firmId = "", topic = ""] = item.id
        .slice(FIRM_DRILL_PREFIX.length)
        .split(":")
      const name =
        firmNames.get(firmId) ?? firmId.replace(/^firm_/, "").replace(/-/g, " ")
      return {
        chip: "firm",
        title: `${name} drill — ${topicLabel(topic)} focus`,
        href: `/companies/${firmId.replace(/^firm_/, "")}`,
        detail: "Top heat topic at this firm",
      }
    }
    if (item.kind === "resource" && item.id === MOCK_ITEM_ID) {
      return {
        chip: "mock",
        title: "Firm mock interview",
        href: "/simulator",
        detail: "Firm-templated stages · self-rated",
      }
    }
    if (item.kind === "diagram") {
      return {
        chip: "diagram",
        title: item.id,
        href: "/learn",
        detail: "Diagram checkpoint",
      }
    }
    return { chip: item.kind, title: item.id, href: "/study" }
  }

  const items = plan?.plan.items ?? []
  const resolved = items.map((item) => {
    const key = itemKey(item)
    const completed = completedOverlay[key] ?? serverCompleted(item)
    return { item, key, completed, view: resolveItem(item) }
  })
  const remaining = resolved.filter((entry) => !entry.completed).length

  const daysLeft =
    profile?.interview_date && loadedAtMs > 0
      ? Math.max(
          0,
          Math.ceil(
            (Date.parse(`${profile.interview_date}T00:00:00Z`) - loadedAtMs) /
              86_400_000
          )
        )
      : null
  const dailyBudgetItems = profile?.availability_minutes
    ? Math.max(
        1,
        Math.floor(profile.availability_minutes / MINUTES_PER_ASSIGNMENT)
      )
    : null
  const neededPerDay =
    daysLeft !== null && remaining > 0
      ? Math.ceil(remaining / Math.max(daysLeft, 1))
      : 0
  const behind =
    daysLeft !== null &&
    dailyBudgetItems !== null &&
    remaining > 0 &&
    neededPerDay > dailyBudgetItems
  const urgency = daysLeft === null ? null : planUrgency(daysLeft, behind)
  const orderedModuleRows = orderModulesByPrereq(modules).map((module) => {
    const completion = moduleCompletion(module, progressByModule.get(module.id))
    return { module, ...completion }
  })
  const firstOpenModuleIndex = orderedModuleRows.findIndex(
    (row) => !row.complete
  )
  const moduleMiniMapRows = orderedModuleRows.slice(0, 6).map((row, index) => ({
    ...row,
    state: row.complete
      ? "done"
      : index === firstOpenModuleIndex
        ? "current"
        : "queued",
  }))
  const hiddenModuleCount = Math.max(
    0,
    orderedModuleRows.length - moduleMiniMapRows.length
  )

  if (phase === "loading") {
    return (
      <PaperSheet seedKey="plan-loading" torn={false}>
        <div className="flex items-center gap-4">
          <Warren mood="thinking" size={48} />
          <p className="text-sm text-muted-foreground">Loading your roadmap…</p>
        </div>
      </PaperSheet>
    )
  }

  if (phase === "error") {
    return (
      <PaperSheet seedKey="plan-error" torn={false}>
        <div className="flex flex-wrap items-center gap-4">
          <Warren mood="concerned" size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">The roadmap didn&apos;t load.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadError ?? "Something went wrong."} Your saved plan is
              untouched.
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
      <PaperSheet seedKey="plan-signed-out" torn={false}>
        <div className="flex flex-wrap items-start gap-4">
          <Warren mood="idle" size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Sign in to keep a roadmap.</p>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Your study plan — company drills, module checkpoints, concept
              labs, and mock slots — saves to your account so it survives
              devices and sessions. Browsing modules and company rooms works
              without an account.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/sign-in">
                <Button>Sign in</Button>
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
    <div className="space-y-8">
      <PaperSheet seedKey="plan-urgency-band" torn={false}>
        <section className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {daysLeft !== null && urgency ? (
            <>
              <CircledNumber
                value={String(daysLeft)}
                label="days to interview"
                size="md"
              />
              <div className="max-w-md space-y-2 text-sm">
                <SemanticPill
                  tone={behind || daysLeft <= 14 ? "streak" : "milestone"}
                >
                  {urgency.label}
                </SemanticPill>
                <p className="leading-relaxed text-muted-foreground">
                  {urgency.detail}
                </p>
              </div>
            </>
          ) : (
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              No interview date set — the plan still sequences work, without
              urgency. Add a date in{" "}
              <Link
                href="/settings"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          )}
          <div className="space-y-1 text-sm">
            {profile?.availability_minutes ? (
              <p>
                Weekly goal ≈{" "}
                <span className="font-medium">
                  {formatMinutesWeekly(profile.availability_minutes)}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({profile.availability_minutes} min/day)
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">
                No daily time budget set yet.
              </p>
            )}
            <p className="text-muted-foreground">
              {items.length > 0
                ? `${remaining} of ${items.length} assignments open`
                : "No assignments yet"}
            </p>
          </div>
          {plan ? (
            <div className="flex flex-wrap items-center gap-2">
              <MetadataPill>{plan.source}</MetadataPill>
              {plan.note ? (
                <span className="text-xs text-muted-foreground">
                  {plan.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      </PaperSheet>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={building || saving}
          onClick={() => void buildFromTargets()}
        >
          {building
            ? "Composing roadmap…"
            : items.length > 0
              ? "Rebuild from my targets"
              : "Build from my targets"}
        </Button>
        {savedTick ? <SemanticPill tone="success">Saved</SemanticPill> : null}
        {notice ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {notice}
          </span>
        ) : null}
      </div>

      {moduleMiniMapRows.length > 0 ? (
        <PaperSheet seedKey="plan-module-minimap" torn={false}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Prereq-ordered module path
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              {firstOpenModuleIndex === -1
                ? "All modules clear"
                : `Next module ${firstOpenModuleIndex + 1}`}
            </span>
          </div>
          <ol className="mt-4 space-y-2">
            {moduleMiniMapRows.map((row, index) => (
              <li key={row.module.id} className="relative flex gap-3 py-2">
                {index < moduleMiniMapRows.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-9 bottom-[-0.65rem] left-[0.8125rem] border-l border-dashed border-border"
                  />
                ) : null}
                {row.state === "current" ? (
                  <Annotate type="circle" color="var(--ink)" padding={3}>
                    <span className="flex size-7 items-center justify-center rounded-full border border-ink bg-ink text-xs text-paper">
                      {index + 1}
                    </span>
                  </Annotate>
                ) : (
                  <span
                    className={
                      row.state === "done"
                        ? "flex size-7 items-center justify-center rounded-full border border-ink/40 text-xs text-muted-foreground"
                        : "flex size-7 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground"
                    }
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {row.state === "done"
                      ? "complete"
                      : row.state === "current"
                        ? "current"
                        : "queued"}{" "}
                    · {Math.round(row.ratio * 100)}%
                  </p>
                  <Link
                    href={`/learn/${row.module.slug}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {row.state === "done" ? (
                      <Annotate
                        type="crossed-off"
                        color="var(--graphite)"
                        padding={2}
                      >
                        {row.module.title}
                      </Annotate>
                    ) : (
                      row.module.title
                    )}
                  </Link>
                  {row.module.prereq_module_ids?.length ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Unlocks after {row.module.prereq_module_ids.length}{" "}
                      prerequisite
                      {row.module.prereq_module_ids.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {hiddenModuleCount > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              +{hiddenModuleCount} later module
              {hiddenModuleCount === 1 ? "" : "s"} after this path.
            </p>
          ) : null}
        </PaperSheet>
      ) : null}

      {behind ? (
        <WarrenCallout mood="concerned" bracket>
          <span>
            {remaining} assignments in {daysLeft} day{daysLeft === 1 ? "" : "s"}{" "}
            is about {neededPerDay}/day — above your ~{dailyBudgetItems}/day
            budget (≈
            {MINUTES_PER_ASSIGNMENT} min each). I&apos;d drop to the core:
            module checkpoints, weak concept labs, and the mock slot.
          </span>
          <span className="mt-2 inline-block">
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void dropToCore()}
            >
              Keep core only
            </Button>
          </span>
        </WarrenCallout>
      ) : null}

      {resolved.length > 0 ? (
        <PaperSheet seedKey="plan-roadmap" torn={false}>
          <ol className="space-y-1">
            {resolved.map(({ item, key, completed, view }, index) => (
              <li key={key} className="relative flex gap-3 py-3">
                {index < resolved.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-11 bottom-[-0.75rem] left-[0.8125rem] border-l border-dashed border-border"
                  />
                ) : null}
                <button
                  type="button"
                  aria-pressed={completed}
                  aria-label={`${completed ? "Reopen" : "Complete"}: ${view.title}`}
                  disabled={saving}
                  onClick={() => void toggleItem(item, completed)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink bg-paper transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {completed ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : null}
                </button>
                <div className="min-w-0 pt-0.5">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    {view.chip}
                    {item.due_at ? ` · due ${formatDue(item.due_at)}` : ""}
                  </p>
                  <Link
                    href={view.href}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {completed ? (
                      <Annotate
                        type="crossed-off"
                        color="var(--graphite)"
                        padding={2}
                      >
                        {view.title}
                      </Annotate>
                    ) : (
                      view.title
                    )}
                  </Link>
                  {view.detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {view.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </PaperSheet>
      ) : (
        <PaperSheet seedKey="plan-empty" torn={false}>
          <div className="flex flex-wrap items-start gap-4">
            <Warren mood="idle" size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">No assignments on the roadmap yet.</p>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Build from your targets and I&apos;ll mix company drills at your
                hottest firm topics, the next module checkpoint in prereq order,
                labs for your weak concepts, and a mock interview slot —
                sequenced against your interview date.
              </p>
            </div>
          </div>
        </PaperSheet>
      )}

      <div className="border-t border-border pt-5 text-sm">
        <Link
          href="/simulator"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Open the interview simulator →
        </Link>
      </div>
    </div>
  )
}
