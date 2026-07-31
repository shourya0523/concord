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
 * Warren — fixed-identity prep coach (DESIGN.md).
 * Distinct mentor: glasses, soft hair, collar — not a blank smiley.
 */
export function Warren({
  mood = "idle",
  userFocused = false,
  aside,
  className,
  size = 72,
}: WarrenProps) {
  const reduced = typeof window !== "undefined" ? prefersReducedMotion() : false
  const effective: WarrenMood = userFocused ? "paused" : mood
  const breathe = !userFocused && effective === "idle" && !reduced

  const browY = effective === "concerned" ? 30 : effective === "celebrating" ? 28 : 32
  const mouth =
    effective === "celebrating"
      ? "M38 58 Q48 66 58 58"
      : effective === "concerned"
        ? "M40 60 Q48 56 56 60"
        : effective === "thinking"
          ? "M40 59 H56"
          : effective === "encouraging"
            ? "M38 58 Q48 64 58 58"
            : "M40 60 Q48 62 56 60"

  return (
    <aside
      className={cn("flex max-w-sm items-start gap-3", className)}
      data-warren-mood={effective}
      aria-label={`Warren, ${effective}`}
    >
      <div
        className="shrink-0"
        style={{
          width: size,
          height: size,
          animation: breathe
            ? "warren-breathe 3.2s ease-in-out infinite"
            : effective === "celebrating" && !reduced
              ? "warren-pop 400ms var(--ease-bounce)"
              : undefined,
        }}
      >
        <svg viewBox="0 0 96 96" width={size} height={size} role="img">
          <title>Warren</title>
          {/* shoulders / collar */}
          <path
            d="M18 88 C 28 70, 68 70, 78 88"
            fill="oklch(0.32 0.02 250)"
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
          <path
            d="M40 78 L48 88 L56 78"
            fill="oklch(0.97 0.01 90)"
            stroke="var(--ink)"
            strokeWidth="1.2"
          />
          {/* head */}
          <ellipse
            cx="48"
            cy="44"
            rx="26"
            ry="28"
            fill="oklch(0.93 0.02 75)"
            stroke="var(--ink)"
            strokeWidth="1.75"
          />
          {/* hair */}
          <path
            d="M24 40 C 26 18, 70 16, 72 40 C 62 28, 34 28, 24 40"
            fill="oklch(0.45 0.03 60)"
            stroke="var(--ink)"
            strokeWidth="1.4"
          />
          {/* glasses */}
          <circle cx="38" cy="44" r="8" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
          <circle cx="58" cy="44" r="8" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
          <path d="M46 44 H50" stroke="var(--ink)" strokeWidth="1.6" />
          <path d="M30 42 H22" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M66 42 H74" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
          {/* eyes */}
          <circle cx="38" cy="44" r="2.2" fill="var(--ink)" />
          <circle cx="58" cy="44" r="2.2" fill="var(--ink)" />
          {/* brows */}
          <path
            d={`M30 ${browY} Q38 ${browY - 3} 46 ${browY}`}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d={`M50 ${browY} Q58 ${browY - 3} 66 ${browY}`}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* nose */}
          <path
            d="M48 46 L46 52 L50 52"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* mouth */}
          <path d={mouth} fill="none" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" />
          {effective === "thinking" ? (
            <>
              <circle cx="78" cy="22" r="5" fill="none" stroke="var(--graphite)" strokeWidth="1.4" />
              <circle cx="86" cy="14" r="3" fill="none" stroke="var(--graphite)" strokeWidth="1.2" />
            </>
          ) : null}
          {effective === "celebrating" ? (
            <path
              d="M20 18 L24 10 M28 20 L32 12 M72 18 L76 10"
              fill="none"
              stroke="var(--lime)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      </div>
      {aside ? (
        <div className="min-w-0 pt-1">
          <p className="font-sans text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Warren
          </p>
          <p className="mt-1 font-sans text-sm leading-snug text-foreground">{aside}</p>
        </div>
      ) : null}
    </aside>
  )
}
