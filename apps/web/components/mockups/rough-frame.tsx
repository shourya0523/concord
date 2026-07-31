"use client"

import * as React from "react"
import rough from "roughjs"

import { cn } from "@ibpe/ui/lib/utils"
import { seedFrom } from "@/lib/mockups/motion"

type RoughFrameProps = {
  seedKey: string
  children: React.ReactNode
  className?: string
  padding?: number
  /**
   * @deprecated Never filter text. Kept for API compat; ignored.
   * Torn edges belong on decorative chrome only, not content.
   */
  torn?: boolean
}

/**
 * Hand-drawn border via rough.js — SVG stroke only.
 * Children stay sharp (no feDisplacement on text).
 */
export function RoughFrame({
  seedKey,
  children,
  className,
  padding = 10,
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
      const node = rc.rectangle(padding / 2, padding / 2, width - padding, height - padding, {
        seed,
        roughness: 0.85,
        bowing: 0.6,
        stroke: "var(--ink)",
        strokeWidth: 1.15,
        fill: "transparent",
      })
      svg.appendChild(node)
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(host)
    return () => ro.disconnect()
  }, [padding, seed])

  return (
    <div ref={hostRef} className={cn("relative bg-card", className)}>
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 z-0 overflow-visible"
        aria-hidden
      />
      <div className="relative z-10 p-5 font-sans md:p-6">{children}</div>
    </div>
  )
}
