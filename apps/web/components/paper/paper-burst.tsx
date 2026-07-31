"use client"

import * as React from "react"
import rough from "roughjs"

import { prefersReducedMotion, seedFrom } from "@/lib/mockups/motion"

/**
 * Hand-drawn paper-burst (rough.js polygons scattering) — the milestone
 * celebration mechanism (DESIGN.md §8). Fixed seeds per shard; fires only
 * when `play` is true (state-confirmed, never optimistic).
 */
export function PaperBurst({
  play,
  seedKey,
  className,
}: {
  play: boolean
  seedKey: string
  className?: string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)

  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg || !play) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    const rc = rough.svg(svg)
    const cx = 120
    const cy = 60
    const colors = ["var(--streak)", "var(--milestone)", "var(--success)", "var(--stone)"]
    for (let i = 0; i < 14; i++) {
      const seed = seedFrom(`${seedKey}-${i}`)
      const angle = (i / 14) * Math.PI * 2 + (seed % 10) / 14
      const distance = 24 + (seed % 46)
      const x = cx + Math.cos(angle) * distance
      const y = cy + Math.sin(angle) * distance * 0.7
      const size = 3 + (seed % 5)
      const node =
        i % 3 === 0
          ? rc.circle(x, y, size, {
              seed,
              roughness: 1.1,
              stroke: colors[i % colors.length],
              strokeWidth: 1.4,
            })
          : rc.polygon(
              [
                [x, y - size / 2],
                [x + size / 2, y + size / 2],
                [x - size / 2, y + size / 2],
              ],
              {
                seed,
                roughness: 1.1,
                stroke: colors[i % colors.length],
                strokeWidth: 1.4,
                fill: colors[(i + 1) % colors.length],
                fillStyle: "hachure",
              },
            )
      if (!prefersReducedMotion()) {
        ;(node as SVGElement).style.animation = `settle-in 400ms var(--ease-bounce) ${i * 30}ms both`
      }
      svg.appendChild(node)
    }
  }, [play, seedKey])

  if (!play) return null
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 240 120"
      className={className}
      aria-hidden
      style={{ width: 240, height: 120 }}
    />
  )
}
