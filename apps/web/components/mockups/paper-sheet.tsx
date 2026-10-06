"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { RoughFrame } from "@/components/mockups/rough-frame"

/**
 * Paper stocks (DESIGN.md §7 material map) — one stock, one meaning:
 * - pad     prepared for you, now (packs, feedback, score). Torn edge + ink frame.
 * - index   recall this (drill + daily-set cards). Clean cut, ruled.
 * - ledger  work the numbers (numeric drills, paper LBO). Green grid.
 * - manila  a container (collections, module covers). Folder tab.
 */
export type PaperStock = "pad" | "index" | "ledger" | "manila"

type PaperSheetProps = {
  seedKey: string
  children: React.ReactNode
  className?: string
  contentClassName?: string
  stock?: PaperStock
  /**
   * Torn edges — only meaningful on the pad stock (default true there). The
   * tear means "pulled off a pad for you", so other stocks are clean cut.
   */
  torn?: boolean
  /** Hero animated tear (score / milestone only — 1–2 per screen). */
  hero?: boolean
  padding?: number
  stroke?: "ink" | "lime" | "graphite"
  hatch?: boolean
}

const STOCK_SURFACE: Record<Exclude<PaperStock, "pad">, string> = {
  index: "stock-index",
  ledger: "stock-ledger",
  manila: "stock-manila",
}

/**
 * Paper insert: a stock-specific surface with a shadow that follows its
 * silhouette, behind content that is never filtered or masked. The pad stock
 * adds the rough.js ink frame inset inside its tear.
 */
export function PaperSheet({
  seedKey,
  children,
  className,
  contentClassName,
  stock = "pad",
  torn,
  hero = false,
  padding,
  stroke = "ink",
  hatch = false,
}: PaperSheetProps) {
  const isPad = stock === "pad"
  const tear = isPad && (torn ?? true)

  return (
    <div
      className={cn("relative isolate", className)}
      data-paper-sheet={hero ? "hero" : "static"}
      data-paper-stock={stock}
    >
      <div aria-hidden className="paper-sheet-shadow pointer-events-none absolute inset-0 -z-10">
        <div
          className={cn(
            "absolute inset-0",
            isPad ? "paper-sheet-surface" : STOCK_SURFACE[stock],
            isPad && (tear ? "paper-torn" : "rounded-[3px]"),
            hero && "paper-torn-hero",
          )}
        />
      </div>
      {isPad ? (
        <RoughFrame
          seedKey={seedKey}
          // Keep the ink frame inside the torn band so the tear stays visible.
          padding={padding ?? (tear ? 22 : 10)}
          stroke={stroke}
          hatch={hatch}
          contentClassName={cn(tear && "py-7 md:py-8", contentClassName)}
          className="h-full bg-transparent text-ink"
        >
          {children}
        </RoughFrame>
      ) : (
        <div
          className={cn(
            "relative h-full p-5 font-sans text-ink md:p-6",
            stock === "manila" && "pt-9 md:pt-10",
            contentClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
