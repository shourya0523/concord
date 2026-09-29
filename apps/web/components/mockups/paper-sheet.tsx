"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { RoughFrame } from "@/components/mockups/rough-frame"

type PaperSheetProps = {
  seedKey: string
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /**
   * Torn top/bottom edges (baked CSS mask). Default true for intentional paper
   * moments (study/pack/score/module cards). Text is never filtered or masked.
   */
  torn?: boolean
  /** Hero animated tear (score / milestone only — 1–2 per screen). */
  hero?: boolean
  padding?: number
  stroke?: "ink" | "lime" | "graphite"
  hatch?: boolean
}

/**
 * Paper insert (DESIGN.md §2/§7): a lighter sheet with grain + fibre texture,
 * torn edges and a drop shadow that follows the tear, then a rough.js ink
 * frame inset inside the tear. The decorative layers sit behind the content.
 */
export function PaperSheet({
  seedKey,
  children,
  className,
  contentClassName,
  torn = true,
  hero = false,
  padding,
  stroke = "ink",
  hatch = false,
}: PaperSheetProps) {
  return (
    <div className={cn("relative isolate", className)} data-paper-sheet={hero ? "hero" : "static"}>
      <div aria-hidden className="paper-sheet-shadow pointer-events-none absolute inset-0 -z-10">
        <div
          className={cn(
            "paper-sheet-surface absolute inset-0",
            torn ? "paper-torn" : "rounded-[3px]",
            hero && "paper-torn-hero",
          )}
        />
      </div>
      <RoughFrame
        seedKey={seedKey}
        // Keep the ink frame inside the torn band so the tear stays visible.
        padding={padding ?? (torn ? 22 : 10)}
        stroke={stroke}
        hatch={hatch}
        contentClassName={cn(torn && "py-7 md:py-8", contentClassName)}
        className="h-full bg-transparent text-ink"
      >
        {children}
      </RoughFrame>
    </div>
  )
}
