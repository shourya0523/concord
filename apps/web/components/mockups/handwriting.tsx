"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion } from "@/lib/mockups/motion"

type Props = {
  /** Short ceremonial phrase only (3–8 words) — never routine text. */
  phrase: string
  className?: string
  play?: boolean
}

/**
 * Ceremonial handwriting moment — readable display phrase + a hand-drawn
 * stroke drawn on with Vivus (DESIGN.md §7). Reserved for rare score / streak
 * / welcome headlines. Reduced motion shows the final state instantly.
 */
export function HandwritingHeadline({ phrase, className, play = true }: Props) {
  const svgRef = React.useRef<SVGSVGElement>(null)

  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (!play || prefersReducedMotion()) {
      svg.querySelectorAll("path").forEach((path) => {
        path.style.strokeDasharray = ""
        path.style.strokeDashoffset = ""
      })
      return
    }

    let cancelled = false
    let vivus: { destroy: () => void } | null = null
    // Vivus touches `window` — load it client-side only.
    void import("vivus").then(({ default: Vivus }) => {
      if (cancelled) return
      // @types/vivus says HTMLElement; Vivus accepts an <svg> at runtime.
      vivus = new Vivus(svg as unknown as HTMLElement, {
        type: "oneByOne",
        duration: 90,
        start: "autostart",
        animTimingFunction: Vivus.EASE_OUT,
      })
    })
    return () => {
      cancelled = true
      vivus?.destroy()
    }
  }, [phrase, play])

  return (
    <div className={cn("space-y-1", className)} aria-label={phrase}>
      <p
        className={cn(
          "font-display text-4xl tracking-tight text-foreground md:text-5xl",
          play && "motion-safe:animate-[settle-in_600ms_var(--ease-settle)]",
        )}
      >
        {phrase}
      </p>
      <svg ref={svgRef} viewBox="0 0 360 22" className="h-5 w-full max-w-md" aria-hidden>
        <path
          d="M4 12 C 40 5, 80 18, 120 9 C 160 2, 200 16, 240 8 C 280 2, 320 14, 356 10"
          fill="none"
          stroke="var(--lime)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M28 17 C 90 12, 170 19, 250 14 C 290 12, 318 15, 334 14"
          fill="none"
          stroke="var(--lime)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </div>
  )
}
