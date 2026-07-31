"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { RoughFrame } from "@/components/mockups/rough-frame"

type PaperSheetProps = {
  seedKey: string
  children: React.ReactNode
  className?: string
  /** Decorative torn strips on top/bottom edges — never filters text. */
  torn?: boolean
  /** Hero animated torn (score / milestone only). */
  hero?: boolean
  padding?: number
}

/**
 * Cream paper insert: rough border + optional torn edge chrome.
 */
export function PaperSheet({
  seedKey,
  children,
  className,
  torn = true,
  hero = false,
  padding,
}: PaperSheetProps) {
  const filter = hero ? "url(#torn-paper-hero)" : "url(#torn-paper-static)"

  return (
    <div className={cn("relative", className)}>
      {torn ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 z-20 h-2 bg-[oklch(0.975_0.014_88)]"
            style={{ filter }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-2 bg-[oklch(0.975_0.014_88)]"
            style={{ filter }}
          />
        </>
      ) : null}
      <RoughFrame
        seedKey={seedKey}
        padding={padding}
        className="bg-[oklch(0.975_0.014_88)]"
      >
        {children}
      </RoughFrame>
    </div>
  )
}
