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
 * Ceremonial handwriting moment — readable display phrase + path underline draw.
 * Reserved for rare score / streak / welcome headlines (DESIGN.md).
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
    path.style.transition = "stroke-dashoffset 1.4s var(--ease-calm, ease-out)"
    path.style.strokeDashoffset = "0"
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
      <svg viewBox="0 0 360 18" className="h-4 w-full max-w-md" aria-hidden>
        <path
          ref={pathRef}
          d="M4 10 C 40 4, 80 16, 120 8 C 160 2, 200 14, 240 7 C 280 2, 320 12, 356 9"
          fill="none"
          stroke="var(--lime)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
