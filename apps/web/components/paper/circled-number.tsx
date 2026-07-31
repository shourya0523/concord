"use client"

import { Annotate } from "@/components/mockups/annotate"
import { cn } from "@ibpe/ui/lib/utils"

/**
 * Result/score number circled per the semantic map (circle = results).
 * Numbers stay calm — the circle draws once, the figure never animates.
 */
export function CircledNumber({
  value,
  label,
  size = "md",
  show = true,
  className,
}: {
  value: string
  label?: string
  size?: "sm" | "md" | "lg"
  show?: boolean
  className?: string
}) {
  const text =
    size === "lg"
      ? "font-display text-5xl md:text-6xl"
      : size === "sm"
        ? "font-display text-2xl"
        : "font-display text-4xl"
  return (
    <span className={cn("inline-flex flex-col items-center gap-1", className)}>
      <Annotate type="circle" color="var(--ink)" padding={8} show={show}>
        <span className={cn("inline-block px-2 py-1 leading-none tracking-tight", text)}>
          {value}
        </span>
      </Annotate>
      {label ? (
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}
    </span>
  )
}
