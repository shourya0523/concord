"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion } from "@/lib/mockups/motion"

type Props = {
  /** Short ceremonial phrase only (3–8 words). */
  phrase: "Great work!" | "You scored 87%!" | "10-day streak!" | "Let's build your prep"
  className?: string
  play?: boolean
}

/**
 * Path-draw handwriting moment — reserved for rare ceremonial headlines.
 * Pre-converted path outlines (not live <text>).
 */
export function HandwritingHeadline({ phrase, className, play = true }: Props) {
  const pathRef = React.useRef<SVGPathElement>(null)

  React.useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const length = path.getTotalLength()
    path.style.strokeDasharray = String(length)
    if (!play || prefersReducedMotion()) {
      path.style.strokeDashoffset = "0"
      return
    }
    path.style.strokeDashoffset = String(length)
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 1.8s ease-out"
    path.style.strokeDashoffset = "0"
  }, [phrase, play])

  const d =
    phrase === "You scored 87%!"
      ? "M8 42 C 40 10, 80 10, 120 42 C 150 70, 190 18, 230 40 C 260 58, 300 28, 340 44"
      : phrase === "Great work!"
        ? "M10 40 C 50 12, 90 70, 140 36 C 180 10, 220 60, 270 38"
        : phrase === "10-day streak!"
          ? "M12 44 C 60 16, 100 66, 160 34 C 210 12, 250 58, 310 40"
          : "M10 42 C 70 14, 140 70, 210 36 C 260 16, 320 54, 380 40"

  return (
    <div className={cn("overflow-hidden", className)} aria-label={phrase}>
      <svg
        viewBox="0 0 400 80"
        className="h-16 w-full max-w-xl"
        role="img"
        aria-hidden={false}
      >
        <title>{phrase}</title>
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text
          x="12"
          y="72"
          className="fill-foreground"
          style={{ fontFamily: "var(--font-display)", fontSize: "22px" }}
        >
          {phrase}
        </text>
      </svg>
    </div>
  )
}
