"use client"

import * as React from "react"

import { Annotate } from "@/components/mockups/annotate"
import { NotionCallout } from "@/components/mockups/journey-shell"
import { Warren, type WarrenMood } from "@/components/mockups/warren"

/**
 * Warren's paper callout — coach aside in a Notion-style block.
 * The bracket annotation is Warren's signature mark (semantic map).
 * Breathing pauses while the user types/reads (userFocused).
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
    <NotionCallout warren={<Warren mood={mood} userFocused={userFocused} size={size} />}>
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Warren
      </p>
      <div className="mt-1 text-sm leading-relaxed">
        {bracket ? (
          <Annotate type="bracket" color="var(--graphite)" padding={3}>
            {children}
          </Annotate>
        ) : (
          children
        )}
      </div>
    </NotionCallout>
  )
}
