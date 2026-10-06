"use client"

import * as React from "react"

import { Annotate } from "@/components/mockups/annotate"
import { Warren, type WarrenMood } from "@/components/mockups/warren"

/**
 * Warren's aside on onionskin (DESIGN.md §7 material map): a translucent sheet
 * laid over your work with a slight tilt, so his note sits on top without
 * hiding what's underneath. Onionskin is Warren-only. The bracket annotation
 * is his signature mark (semantic map). Breathing pauses while the user
 * types/reads (userFocused).
 */
export function WarrenCallout({
  children,
  mood = "idle",
  userFocused = false,
  size = 56,
  bracket = false,
}: {
  children: React.ReactNode
  mood?: WarrenMood
  userFocused?: boolean
  size?: number
  /** Draw Warren's bracket mark around the aside text. */
  bracket?: boolean
}) {
  return (
    <aside
      className="paper-onionskin flex rotate-[0.4deg] gap-3 rounded-[2px] px-3 py-3 text-sm leading-relaxed text-ink"
      data-paper-stock="onionskin"
    >
      <div className="shrink-0 pt-0.5">
        <Warren mood={mood} userFocused={userFocused} size={size} />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Warren</p>
        <div className="mt-1 text-sm leading-relaxed">
          {bracket ? (
            <Annotate type="bracket" padding={4} block>
              {children}
            </Annotate>
          ) : (
            children
          )}
        </div>
      </div>
    </aside>
  )
}
