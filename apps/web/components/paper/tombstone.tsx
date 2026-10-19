"use client"

import * as React from "react"
import rough from "roughjs"

import { cn } from "@ibpe/ui/lib/utils"
import { resolveCssColor, seedFrom } from "@/lib/mockups/motion"

const RECORD = "This announcement appears as a matter of record only."

function closedLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `Closed · ${date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`
}

/**
 * Achievement as a deal tombstone (DESIGN.md §16): banks commemorate closed
 * deals with notices that read "This announcement appears as a matter of
 * record only." Locked ones are pencil outlines that show the distance left.
 */
export function Tombstone({
  id,
  face,
  what,
  description,
  earnedAt,
  locked = false,
  progress,
  progressLabel,
  place = false,
  compact = false,
  className,
}: {
  id: string
  face: string
  what: string
  description?: string
  earnedAt?: string | null
  locked?: boolean
  /** 0–1 toward unlocking (locked only). */
  progress?: number | null
  progressLabel?: string | null
  /** Settle onto the shelf (just earned). */
  place?: boolean
  compact?: boolean
  className?: string
}) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)

  React.useEffect(() => {
    if (!locked) return
    const host = hostRef.current
    const svg = svgRef.current
    if (!host || !svg) return
    const draw = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w < 8 || h < 8) return
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`)
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      const rc = rough.svg(svg)
      const seed = seedFrom(`tomb-${id}`)
      svg.appendChild(
        rc.rectangle(3, 3, w - 6, h - 6, {
          seed,
          roughness: 1.4,
          bowing: 1,
          stroke: resolveCssColor(host, "var(--graphite)"),
          strokeWidth: 1,
          strokeLineDash: [5, 4],
          disableMultiStroke: true,
        }),
      )
      svg.appendChild(
        rc.rectangle(9, 9, w - 18, h - 18, {
          seed: seed + 1,
          roughness: 1.2,
          stroke: resolveCssColor(host, "var(--pencil)"),
          strokeWidth: 0.7,
          disableMultiStroke: true,
        }),
      )
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(host)
    return () => ro.disconnect()
  }, [id, locked])

  const closed = closedLabel(earnedAt)
  return (
    <div
      ref={hostRef}
      data-testid={locked ? "tombstone-locked" : "tombstone"}
      data-achievement={id}
      className={cn(
        "relative grid content-start gap-2 px-4 pt-4 pb-3.5 text-center",
        compact ? "min-h-40" : "min-h-60",
        locked
          ? "text-ink/60"
          : "paper-lift bg-[#fffdf8] bg-[image:var(--paper-grain)] shadow-[inset_0_0_0_1px_rgb(17_17_17/0.85)] outline outline-1 -outline-offset-[6px] outline-ink/85 [filter:drop-shadow(0_6px_10px_rgb(60_45_20/0.08))]",
        place && !locked && "motion-place",
        className,
      )}
    >
      {locked ? <svg ref={svgRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" /> : null}
      {!compact ? <p className="px-1.5 text-[9.5px] leading-snug text-muted-foreground italic">{RECORD}</p> : null}
      <p className={cn("font-display leading-none break-words", compact ? "text-2xl" : "text-[2.1rem]")}>{face}</p>
      <p className="font-mono text-[10px] font-medium tracking-[0.12em] uppercase">{what}</p>
      {description && !compact ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {locked ? (
        <div className="mt-auto space-y-1.5 pt-2">
          {progress != null ? (
            <div className="mx-auto h-[3px] w-4/5 bg-stone" aria-hidden>
              <div className="h-full bg-streak-foreground" style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }} />
            </div>
          ) : null}
          {progressLabel ? (
            <p className="font-mono text-[10px] tracking-[0.08em] text-streak-foreground">{progressLabel}</p>
          ) : null}
        </div>
      ) : closed ? (
        <p className="mt-auto border-t border-stone pt-2 font-mono text-[10px] text-muted-foreground">{closed}</p>
      ) : null}
    </div>
  )
}
