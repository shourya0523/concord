import * as React from "react"
import { Focus } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

export type WeakTopicChipProps = {
  label: string
  severity?: "low" | "medium" | "high"
  focused?: boolean
  onClick?: () => void
  className?: string
}

const severityDot: Record<NonNullable<WeakTopicChipProps["severity"]>, string> = {
  low: "bg-muted-foreground/50",
  medium: "bg-weak/80",
  high: "bg-weak",
}

/**
 * Compact weak-topic metadata chip / focus callout.
 */
function WeakTopicChip({
  label,
  severity = "medium",
  focused = false,
  onClick,
  className,
}: WeakTopicChipProps) {
  const Comp = onClick ? "button" : "span"

  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      data-slot="weak-topic-chip"
      data-focused={focused || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-[background,border-color] duration-[var(--duration-micro)] ease-[var(--ease-terminal)]",
        focused
          ? "border-lime bg-accent text-accent-foreground"
          : "border-border bg-muted/60 text-foreground",
        onClick && "cursor-pointer hover:border-lime/60 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", severityDot[severity])}
        aria-hidden
      />
      {focused ? <Focus className="size-3 text-lime-foreground/80" aria-hidden /> : null}
      <span>{label}</span>
      <span className="sr-only">
        {focused ? "Currently focused weak topic" : "Weak topic"}
        {`, severity ${severity}`}
      </span>
    </Comp>
  )
}

export { WeakTopicChip }
