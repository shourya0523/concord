"use client"

import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { Warren } from "@/components/mockups/warren"

import { PaperBurst } from "./paper-burst"

/**
 * Level-up hero (DESIGN.md §16 ceremony budget): one of only two moments that
 * get the live tear, Warren celebrating and the paper burst.
 */
export function PromotionMemo({
  title,
  previousTitle,
  xpTotal,
  play = true,
  seedKey,
}: {
  title: string
  previousTitle: string
  xpTotal?: number | null
  play?: boolean
  seedKey: string
}) {
  return (
    <div className="relative" data-testid="promotion-memo">
      <PaperBurst play={play} seedKey={`promo-${seedKey}`} className="pointer-events-none absolute -top-10 right-4 z-20" />
      <PaperSheet seedKey={`promo-sheet-${seedKey}`} hero contentClassName="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Internal memorandum
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-xs">
              <dt className="text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">To</dt>
              <dd>You</dd>
              <dt className="text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">From</dt>
              <dd>Warren</dd>
              <dt className="text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">Re</dt>
              <dd>Promotion, effective today</dd>
            </dl>
          </div>
          <Warren mood="celebrating" size={64} />
        </div>
        <HandwritingHeadline phrase={title} play={play} />
        <p className="text-sm text-muted-foreground">
          Promoted from {previousTitle}
          {xpTotal != null ? ` at ${xpTotal} XP` : ""}. The next title is earned the same way: graded answers, one
          day at a time.
        </p>
      </PaperSheet>
    </div>
  )
}
