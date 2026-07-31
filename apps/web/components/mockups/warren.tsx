"use client"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion } from "@/lib/mockups/motion"

export type WarrenMood =
  | "idle"
  | "thinking"
  | "encouraging"
  | "celebrating"
  | "concerned"
  | "paused"

type WarrenProps = {
  mood?: WarrenMood
  /** Pause breathing during user focus (typing/reading). */
  userFocused?: boolean
  aside?: string
  className?: string
  size?: number
}

/**
 * Fixed-identity coach — SVG layer-swap sprite (Phase 1 path from DESIGN.md).
 */
export function Warren({
  mood = "idle",
  userFocused = false,
  aside,
  className,
  size = 88,
}: WarrenProps) {
  const reduced =
    typeof window !== "undefined" ? prefersReducedMotion() : false
  const effective: WarrenMood = userFocused ? "paused" : mood
  const breathe = !userFocused && effective === "idle" && !reduced

  const brow =
    effective === "concerned"
      ? "M28 34 Q44 28 60 34"
      : effective === "celebrating"
        ? "M28 36 Q44 30 60 36"
        : "M28 36 Q44 34 60 36"
  const mouth =
    effective === "celebrating"
      ? "M34 58 Q44 68 54 58"
      : effective === "concerned"
        ? "M34 62 Q44 56 54 62"
        : effective === "thinking"
          ? "M36 60 L52 60"
          : "M34 60 Q44 64 54 60"

  return (
    <aside
      className={cn("flex items-start gap-3", className)}
      data-warren-mood={effective}
      aria-label={`Warren, ${effective}`}
    >
      <div
        className={cn(
          "shrink-0 transition-transform",
          breathe && "motion-safe:animate-pulse",
          effective === "celebrating" && "motion-safe:scale-105",
        )}
        style={{
          width: size,
          height: size,
          animation:
            breathe
              ? "warren-breathe 3.2s ease-in-out infinite"
              : effective === "celebrating" && !reduced
                ? "warren-pop 400ms var(--ease-bounce)"
                : undefined,
        }}
      >
        <svg viewBox="0 0 88 88" width={size} height={size} role="img">
          <title>Warren</title>
          <circle cx="44" cy="44" r="36" fill="var(--stone)" stroke="var(--ink)" strokeWidth="2" />
          <ellipse
            cx="44"
            cy="48"
            rx="28"
            ry="26"
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
          <circle cx="34" cy="42" r="3" fill="var(--ink)" />
          <circle cx="54" cy="42" r="3" fill="var(--ink)" />
          {effective === "thinking" ? (
            <circle cx="66" cy="22" r="4" fill="none" stroke="var(--graphite)" strokeWidth="1.5" />
          ) : null}
          <path d={brow} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
          <path d={mouth} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
          {effective === "encouraging" ? (
            <path
              d="M22 70 Q44 82 66 70"
              fill="none"
              stroke="var(--lime)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      </div>
      {aside ? (
        <div className="border-l-2 border-[var(--milestone)] pl-3 text-sm leading-relaxed text-muted-foreground">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Warren
          </p>
          <p className="mt-1 text-foreground">{aside}</p>
        </div>
      ) : null}
    </aside>
  )
}
