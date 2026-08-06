"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"

import {
  Annotate,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import { readStoredTargets } from "@/components/target-select-island"
import { topicLabel } from "@/lib/topics"

/** Shared-heat threshold: raw 0–1 intensity, per DESIGN.md §10.4. */
const SHARED_INTENSITY = 0.5
/** Below this many tagged signals a firm's heat is directional only. */
const SPARSE_SAMPLE_N = 20
const LIST_LIMIT = 6

type HeatPayload = {
  firms: Array<{ id: string; slug: string; name: string }>
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
  note?: string
}

type SharedTopic = {
  topic: string
  hits: Array<{ firmId: string; intensity: number }>
}

type UniqueTopic = {
  topic: string
  firmId: string
  intensity: number
}

type Insights = {
  shared: SharedTopic[]
  unique: UniqueTopic[]
  sparse: Array<{ id: string; name: string; n: number }>
}

function computeInsights(payload: HeatPayload): Insights {
  const firmName = new Map(payload.firms.map((firm) => [firm.id, firm.name]))
  const byTopic = new Map<string, Map<string, number>>()
  const firmSamples = new Map<string, number>()

  for (const row of payload.topics) {
    firmSamples.set(
      row.firm_id,
      (firmSamples.get(row.firm_id) ?? 0) + row.sample_size
    )
    if (row.topic_id === "untagged") continue
    const firms = byTopic.get(row.topic_id) ?? new Map<string, number>()
    firms.set(row.firm_id, Math.max(firms.get(row.firm_id) ?? 0, row.intensity))
    byTopic.set(row.topic_id, firms)
  }

  const shared: SharedTopic[] = []
  const unique: UniqueTopic[] = []
  for (const [topic, firms] of byTopic) {
    const hot = [...firms.entries()]
      .filter(([, intensity]) => intensity >= SHARED_INTENSITY)
      .map(([firmId, intensity]) => ({ firmId, intensity }))
      .sort((a, b) => b.intensity - a.intensity)
    if (hot.length >= 2) shared.push({ topic, hits: hot })
    else if (hot.length === 1 && hot[0]) {
      unique.push({ topic, firmId: hot[0].firmId, intensity: hot[0].intensity })
    }
  }

  shared.sort(
    (a, b) =>
      b.hits.length - a.hits.length ||
      (b.hits[0]?.intensity ?? 0) - (a.hits[0]?.intensity ?? 0)
  )
  unique.sort((a, b) => b.intensity - a.intensity)

  const sparse = payload.firms
    .map((firm) => ({
      id: firm.id,
      name: firm.name,
      n: firmSamples.get(firm.id) ?? 0,
    }))
    .filter((firm) => firm.n < SPARSE_SAMPLE_N)

  return {
    shared,
    unique,
    sparse: sparse.map((firm) => ({
      ...firm,
      name: firmName.get(firm.id) ?? firm.name,
    })),
  }
}

/**
 * Compare-mode insights under the heat matrix: shared heat vs firm-unique
 * heat, plus a low-sample sparsity warning. Fetches the same /api/prep/heat
 * payload as the matrix (raw 0–1 intensities) for the selected firm ids.
 */
export function HeatInsightsIsland({
  firmIds,
  className,
}: {
  firmIds?: string[]
  className?: string
}) {
  const [ids, setIds] = React.useState<string[]>(firmIds ?? [])
  const [payload, setPayload] = React.useState<HeatPayload | null>(null)
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle")

  React.useEffect(() => {
    if (firmIds?.length) {
      setIds(firmIds)
      return
    }
    setIds(readStoredTargets())
  }, [firmIds])

  const idsKey = ids.join(",")

  React.useEffect(() => {
    if (ids.length === 0) {
      setPayload(null)
      setStatus("idle")
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams()
    ids.forEach((id) => params.append("firm_id", id))
    setStatus("loading")
    fetch(`/api/prep/heat?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Heat insights failed (${response.status})`)
        return (await response.json()) as HeatPayload
      })
      .then((next) => {
        setPayload(next)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.warn("[heat] Could not compute compare insights", error)
        setPayload(null)
        setStatus("error")
      })
    return () => controller.abort()
  }, [idsKey])

  const insights = React.useMemo(
    () => (payload ? computeInsights(payload) : null),
    [payload]
  )

  if (ids.length === 0 || status === "idle") return null

  if (status === "loading") {
    return (
      <p className="text-xs text-muted-foreground">
        Finding shared and firm-unique topics…
      </p>
    )
  }

  if (status === "error") {
    return (
      <p className="border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
        Could not load compare insights — the heat map above still works.
      </p>
    )
  }

  if (!insights || !payload || payload.topics.length === 0) return null

  const firmName = new Map(payload.firms.map((firm) => [firm.id, firm.name]))
  const sharedVisible = insights.shared.slice(0, LIST_LIMIT)
  const uniqueVisible = insights.unique.slice(0, LIST_LIMIT)
  const sharedPct = Math.round(SHARED_INTENSITY * 100)

  return (
    <section
      className={className}
      aria-label="Shared and firm-unique heat insights"
    >
      <div className="space-y-6">
        {insights.sparse.length > 0 ? (
          <section className="border border-border bg-background/30 px-4 py-4">
            <div className="space-y-2">
              <SemanticPill tone="streak" icon={false}>
                <AlertTriangle className="size-3" aria-hidden />
                <span
                  aria-hidden
                  className="inline-block size-2 bg-[repeating-linear-gradient(-45deg,var(--streak-foreground),var(--streak-foreground)_1px,transparent_1px,transparent_3px)]"
                />
                Thin report volume — treat heat as a rough guide
              </SemanticPill>
              <p className="text-xs text-muted-foreground">
                {insights.sparse
                  .map(
                    (firm) =>
                      `${firm.name} (${firm.n === 1 ? "1 report" : `${firm.n} reports`})`,
                  )
                  .join(" · ")}{" "}
                — fewer than {SPARSE_SAMPLE_N} tagged reports per firm. Patterns
                here can shift as more reports arrive.
              </p>
            </div>
          </section>
        ) : null}

        <WarrenCallout mood="thinking" bracket>
          Shared heat is efficient: one practice set can cover several firms.
          Firm-unique heat deserves its own session for the firm most likely to
          press that topic.
        </WarrenCallout>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="border border-border bg-background/30 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
              <SemanticPill tone="success">
                Shared heat · {insights.shared.length} topics
              </SemanticPill>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                ≥ {sharedPct}% heat at 2+ firms
              </span>
            </div>
            {sharedVisible.length > 0 ? (
              <ul>
                {sharedVisible.map((entry) => (
                  <li
                    key={entry.topic}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-stone/60 py-2.5"
                  >
                    <Annotate
                      type="underline"
                      color="var(--success)"
                      padding={2}
                    >
                      <span className="text-sm text-foreground">
                        {topicLabel(entry.topic)}
                      </span>
                    </Annotate>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {entry.hits
                        .map(
                          (hit) =>
                            `${firmName.get(hit.firmId) ?? hit.firmId} ${Math.round(hit.intensity * 100)}%`,
                        )
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                No topic reaches {sharedPct}% heat at two firms yet — one
                practice set will not cover the whole set.
              </p>
            )}
            {insights.shared.length > sharedVisible.length ? (
              <p className="pt-2 text-xs text-muted-foreground/80">
                + {insights.shared.length - sharedVisible.length} more shared
                topics
              </p>
            ) : null}
          </section>

          <section className="border border-border bg-background/30 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
              <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Firm-unique heat
              </h3>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                hot at exactly one firm
              </span>
            </div>
            {uniqueVisible.length > 0 ? (
              <ul>
                {uniqueVisible.map((entry) => (
                  <li
                    key={`${entry.topic}-${entry.firmId}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-stone/60 py-2.5"
                  >
                    <Annotate
                      type="bracket"
                      color="var(--graphite)"
                      padding={3}
                    >
                      <span className="text-sm text-foreground">
                        {topicLabel(entry.topic)} —{" "}
                        {firmName.get(entry.firmId) ?? entry.firmId}
                      </span>
                    </Annotate>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {Math.round(entry.intensity * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                No single-firm outliers yet — everything hot is hot across the
                set.
              </p>
            )}
            {insights.unique.length > uniqueVisible.length ? (
              <p className="pt-2 text-xs text-muted-foreground/80">
                + {insights.unique.length - uniqueVisible.length} more
                firm-unique topics
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  )
}
