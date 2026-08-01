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
   * Decorative torn strips on top/bottom edges — never filters text.
   * Default true for intentional paper moments (study/pack/score/module cards).
   */
  torn?: boolean
  /** Hero animated torn (score / milestone only). */
  hero?: boolean
  padding?: number
  stroke?: "ink" | "lime" | "graphite"
  hatch?: boolean
}

/**
 * Cream paper insert: rough.js border + optional torn edge chrome (DESIGN.md §2/§7).
 * Use for study cards, packs, score moments, module cards — not list rows.
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
  const filter = hero ? "url(#torn-paper-hero)" : "url(#torn-paper-static)"

  return (
    <div className={cn("relative", className)}>
      {torn ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-0 z-20 h-4 bg-paper shadow-[0_1px_0_rgba(35,31,28,0.08)]"
            style={{ filter }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 bottom-0 z-20 h-4 bg-paper shadow-[0_-1px_0_rgba(35,31,28,0.08)]"
            style={{ filter }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-4 bottom-4 left-0 z-20 w-3 bg-paper/95"
            style={{ filter }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-5 right-0 bottom-5 z-20 w-3 bg-paper/95"
            style={{ filter }}
          />
        </>
      ) : null}
      <RoughFrame
        seedKey={seedKey}
        padding={padding}
        stroke={stroke}
        hatch={hatch}
        contentClassName={contentClassName}
        className="bg-paper text-ink"
      >
        {children}
      </RoughFrame>
    </div>
  )
}
