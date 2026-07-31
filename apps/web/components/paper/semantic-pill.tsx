import { AlertTriangle, Check, Flame, X } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

const TONES = {
  success: {
    classes: "border-success-foreground/30 bg-success/60 text-success-foreground",
    Icon: Check,
  },
  error: {
    classes: "border-error-foreground/30 bg-error/50 text-error-foreground",
    Icon: X,
  },
  streak: {
    classes: "border-streak-foreground/30 bg-streak/60 text-streak-foreground",
    Icon: Flame,
  },
  milestone: {
    classes: "border-milestone-foreground/30 bg-milestone/50 text-milestone-foreground",
    Icon: Check,
  },
  weak: {
    classes: "border-error-foreground/40 bg-error/40 text-error-foreground",
    Icon: AlertTriangle,
  },
  neutral: {
    classes: "border-border bg-secondary text-muted-foreground",
    Icon: Check,
  },
} as const

export type SemanticTone = keyof typeof TONES

/**
 * Pastel semantic pill (streaks/XP/correctness/milestones) — always pairs
 * hue with an icon so pastel is never the sole signal (DESIGN.md §3).
 */
export function SemanticPill({
  tone,
  children,
  className,
  icon = true,
}: {
  tone: SemanticTone
  children: React.ReactNode
  className?: string
  icon?: boolean
}) {
  const meta = TONES[tone]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.classes,
        className,
      )}
      data-tone={tone}
    >
      {icon ? <meta.Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  )
}
