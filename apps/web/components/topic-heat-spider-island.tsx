"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

import { readStoredTargets } from "@/components/target-select-island"
import { prefersReducedMotion } from "@/lib/mockups/motion"
import { sortTopicSlugs, topicLabel } from "@/lib/topics"

type HeatPayload = {
  firms: Array<{ id: string; slug: string; name: string }>
  topics: Array<{
    firm_id: string
    topic_id: string
    intensity: number
    sample_size: number
  }>
}

type FirmSeries = {
  id: string
  name: string
  colorVar: string
  values: number[]
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const RING_COUNT = 4
/** Comfortable desktop size — fills width without blowing past the viewport. */
const SIZE = 560
const CENTER = SIZE / 2
const RADIUS = 175
const LABEL_RADIUS = RADIUS + 48

function shortAxisLabel(full: string): string {
  if (full.length <= 18) return full
  const cut = full.slice(0, 17)
  const space = cut.lastIndexOf(" ")
  return `${(space > 8 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function polarToCartesian(
  angleRad: number,
  radius: number,
): { x: number; y: number } {
  // Start at top (−π/2), clockwise through topics.
  return {
    x: CENTER + radius * Math.cos(angleRad - Math.PI / 2),
    y: CENTER + radius * Math.sin(angleRad - Math.PI / 2),
  }
}

function polygonPoints(
  values: number[],
  axisCount: number,
  scale = 1,
): string {
  if (axisCount === 0) return ""
  return values
    .map((value, index) => {
      const angle = (index / axisCount) * Math.PI * 2
      const r = RADIUS * Math.max(0, Math.min(1, value)) * scale
      const { x, y } = polarToCartesian(angle, r)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

/** Ease-out cubic — calm grow from center (DESIGN.md motion). */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Stagger each firm slightly so outlines bloom in sequence. */
function seriesScale(progress: number, index: number): number {
  const delay = index * 0.1
  const span = Math.max(0.35, 1 - delay)
  return Math.max(0, Math.min(1, (progress - delay) / span))
}

function buildSeries(payload: HeatPayload, firmIds: string[]): {
  axes: Array<{ id: string; label: string }>
  series: FirmSeries[]
} {
  const firmMeta = new Map(payload.firms.map((firm) => [firm.id, firm]))
  const intensity = new Map<string, number>()
  for (const row of payload.topics) {
    if (row.topic_id === "untagged") continue
    const key = `${row.firm_id}::${row.topic_id}`
    intensity.set(key, Math.max(intensity.get(key) ?? 0, row.intensity))
  }

  const axes = sortTopicSlugs(
    new Set(
      payload.topics
        .map((row) => row.topic_id)
        .filter((topic) => topic !== "untagged"),
    ),
  ).map((id) => ({ id, label: topicLabel(id) }))

  const orderedFirms = firmIds.filter((id) => firmMeta.has(id))
  const series = orderedFirms.map((id, index) => {
    const firm = firmMeta.get(id)!
    return {
      id,
      name: firm.name,
      colorVar: CHART_COLORS[index % CHART_COLORS.length]!,
      values: axes.map(
        (axis) => intensity.get(`${id}::${axis.id}`) ?? 0,
      ),
    }
  })

  return { axes, series }
}

/**
 * Firm-compare spider map. Axes = topics; one polygon per selected firm.
 * Works with any firm count (including 1–2).
 */
export function TopicHeatSpiderIsland({
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
        if (!response.ok) throw new Error(`Heat request failed (${response.status})`)
        return (await response.json()) as HeatPayload
      })
      .then((next) => {
        setPayload(next)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.warn("[heat-spider] Could not load occurrence signals", error)
        setPayload(null)
        setStatus("error")
      })

    return () => controller.abort()
  }, [ids.join(",")])

  const chart = React.useMemo(() => {
    if (!payload || ids.length === 0) return null
    return buildSeries(payload, ids)
  }, [payload, ids])

  const chartKey = chart
    ? `${chart.series.map((firm) => firm.id).join(",")}|${chart.axes.length}`
    : ""

  /** 0→1 bloom progress; polygons grow from the center outward. */
  const [bloom, setBloom] = React.useState(1)

  React.useEffect(() => {
    if (!chartKey) return
    if (prefersReducedMotion()) {
      setBloom(1)
      return
    }
    setBloom(0)
    const started = performance.now()
    const duration = 780
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      setBloom(easeOutCubic(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [chartKey])

  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Firm spider
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Same topic heat as the map, drawn as a spider chart — one outline per
          firm. Farther from the centre means the topic comes up more often.
        </p>
      </div>

      {ids.length === 0 ? (
        <p className="border border-dashed border-border bg-paper px-4 py-6 text-sm text-muted-foreground">
          Select at least one target firm to render the spider map.
        </p>
      ) : null}

      {ids.length > 0 && (status === "loading" || status === "idle") ? (
        <p className="text-sm text-muted-foreground">Loading spider map…</p>
      ) : null}

      {ids.length > 0 && status === "error" ? (
        <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          Could not load heat signals for the spider map.
        </p>
      ) : null}

      {ids.length > 0 && status === "ready" && chart && chart.axes.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          No tagged topic signals are available to plot yet.
        </p>
      ) : null}

      {ids.length > 0 && status === "ready" && chart && chart.axes.length > 0 ? (
        <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-center lg:gap-10">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full max-w-[min(100%,560px)] shrink-0 overflow-visible text-ink"
            role="img"
            aria-labelledby="heat-spider-title heat-spider-desc"
          >
            <title id="heat-spider-title">Firm topic heat spider map</title>
            <desc id="heat-spider-desc">
              Radar chart comparing topic intensity across{" "}
              {chart.series.map((firm) => firm.name).join(", ")}.
            </desc>

            {/* Grid rings — bloom from center */}
            {Array.from({ length: RING_COUNT }, (_, ring) => {
              const ringReveal = Math.min(
                1,
                Math.max(0, bloom * RING_COUNT - ring),
              )
              const r = ((RADIUS * (ring + 1)) / RING_COUNT) * ringReveal
              if (r < 1) return null
              const points = Array.from(
                { length: chart.axes.length },
                (__, i) => {
                  const angle = (i / chart.axes.length) * Math.PI * 2
                  const { x, y } = polarToCartesian(angle, r)
                  return `${x.toFixed(2)},${y.toFixed(2)}`
                },
              ).join(" ")
              return (
                <polygon
                  key={`ring-${ring}`}
                  points={points}
                  fill={ring === RING_COUNT - 1 ? "var(--heat-0)" : "none"}
                  fillOpacity={
                    ring === RING_COUNT - 1 ? 0.55 * ringReveal : 0
                  }
                  stroke="var(--stone)"
                  strokeWidth={1.25}
                  strokeOpacity={0.35 + 0.65 * ringReveal}
                />
              )
            })}

            {/* Spokes + labels */}
            {chart.axes.map((axis, index) => {
              const angle = (index / chart.axes.length) * Math.PI * 2
              const tip = polarToCartesian(angle, RADIUS * bloom)
              const label = polarToCartesian(angle, LABEL_RADIUS)
              const anchor =
                Math.abs(label.x - CENTER) < 12
                  ? "middle"
                  : label.x > CENTER
                    ? "start"
                    : "end"
              return (
                <g key={axis.id}>
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={tip.x}
                    y2={tip.y}
                    stroke="var(--stone)"
                    strokeWidth={1.25}
                    strokeOpacity={0.4 + 0.6 * bloom}
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    className="fill-graphite"
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-sans)",
                      opacity: Math.max(0, (bloom - 0.55) / 0.45),
                    }}
                  >
                    <title>{axis.label}</title>
                    {shortAxisLabel(axis.label)}
                  </text>
                </g>
              )
            })}

            {/* Firm polygons — grow from center outward, staggered */}
            {chart.series.map((firm, firmIndex) => {
              const scale = seriesScale(bloom, firmIndex)
              return (
                <polygon
                  key={firm.id}
                  points={polygonPoints(
                    firm.values,
                    chart.axes.length,
                    scale,
                  )}
                  fill={firm.colorVar}
                  fillOpacity={0.16 * scale}
                  stroke={firm.colorVar}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  strokeOpacity={0.35 + 0.65 * scale}
                />
              )
            })}

            {/* Value dots */}
            {chart.series.map((firm, firmIndex) => {
              const scale = seriesScale(bloom, firmIndex)
              return firm.values.map((value, index) => {
                const angle = (index / chart.axes.length) * Math.PI * 2
                const { x, y } = polarToCartesian(
                  angle,
                  RADIUS * Math.max(0, Math.min(1, value)) * scale,
                )
                return (
                  <circle
                    key={`${firm.id}-${chart.axes[index]?.id ?? index}`}
                    cx={x}
                    cy={y}
                    r={3.5 * Math.max(scale, 0.01)}
                    fill="var(--paper)"
                    stroke={firm.colorVar}
                    strokeWidth={1.75}
                    opacity={scale}
                  />
                )
              })
            })}
          </svg>

          <ul
            className="flex w-full max-w-xs flex-col gap-2.5 lg:w-48 lg:shrink-0 lg:pt-2"
            style={{ opacity: Math.max(0, (bloom - 0.4) / 0.6) }}
          >
            <li className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Firms
            </li>
            {chart.series.map((firm) => (
              <li
                key={firm.id}
                className="flex items-center gap-2.5 text-sm text-ink"
              >
                <span
                  className="size-3 shrink-0 rounded-sm border border-ink/20"
                  style={{ backgroundColor: firm.colorVar }}
                  aria-hidden
                />
                <span className="leading-snug">{firm.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
