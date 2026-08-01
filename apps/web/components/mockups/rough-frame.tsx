"use client"

import * as React from "react"
import rough from "roughjs"

import { cn } from "@ibpe/ui/lib/utils"
import { seedFrom } from "@/lib/mockups/motion"

type RoughFrameProps = {
  seedKey: string
  children: React.ReactNode
  className?: string
  contentClassName?: string
  padding?: number
  /** Ink stroke (default) or lime for interactive emphasis frames. */
  stroke?: "ink" | "lime" | "graphite"
  /** Optional hachure fill behind content (drill emphasis only). */
  hatch?: boolean
  /**
   * @deprecated Never filter text. Kept for API compat; ignored.
   */
  torn?: boolean
}

const STROKE: Record<NonNullable<RoughFrameProps["stroke"]>, string> = {
  ink: "var(--ink)",
  lime: "var(--lime)",
  graphite: "var(--graphite)",
}

/**
 * Hand-drawn border via rough.js — SVG stroke only (DESIGN.md §7).
 * Fixed seed + ResizeObserver redraw. Children stay sharp (no feDisplacement).
 */
export function RoughFrame({
  seedKey,
  children,
  className,
  contentClassName,
  padding = 10,
  stroke = "ink",
  hatch = false,
}: RoughFrameProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const seed = React.useMemo(() => seedFrom(seedKey), [seedKey])

  React.useEffect(() => {
    const host = hostRef.current
    const svg = svgRef.current
    if (!host || !svg) return

    const draw = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width < 8 || height < 8) return
      svg.setAttribute("width", String(width))
      svg.setAttribute("height", String(height))
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      const rc = rough.svg(svg)
      const x = padding / 2
      const y = padding / 2
      const w = Math.max(4, width - padding)
      const h = Math.max(4, height - padding)
      const node = rc.rectangle(x, y, w, h, {
        seed,
        roughness: 1.05,
        bowing: 0.85,
        stroke: STROKE[stroke],
        strokeWidth: stroke === "lime" ? 1.35 : 1.2,
        fill: hatch ? STROKE[stroke] : "transparent",
        fillStyle: hatch ? "hachure" : "solid",
        fillWeight: 0.6,
        hachureGap: 6,
      })
      svg.appendChild(node)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(host)
    return () => ro.disconnect()
  }, [hatch, padding, seed, stroke])

  return (
    <div ref={hostRef} className={cn("relative bg-paper text-ink", className)}>
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 z-0 overflow-visible"
        aria-hidden
      />
      <div className={cn("relative z-10 p-5 font-sans md:p-6", contentClassName)}>
        {children}
      </div>
    </div>
  )
}
