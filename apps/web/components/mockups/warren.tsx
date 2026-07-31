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
  userFocused?: boolean
  aside?: string
  className?: string
  size?: number
}

/**
 * Warren — fixed coach identity (DESIGN.md).
 * Older mentor: balding crown, round glasses, navy jacket — readable at 72px.
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

  const brow =
    effective === "concerned"
      ? "M31 36 Q38 33 45 36"
      : effective === "celebrating"
        ? "M31 34 Q38 31 45 34"
        : "M31 35 Q38 33 45 35"
  const brow2 =
    effective === "concerned"
      ? "M51 36 Q58 33 65 36"
      : effective === "celebrating"
        ? "M51 34 Q58 31 65 34"
        : "M51 35 Q58 33 65 35"
  const mouth =
    effective === "celebrating"
      ? "M40 58 Q48 64 56 58"
      : effective === "concerned"
        ? "M40 60 Q48 56 56 60"
        : effective === "thinking"
          ? "M42 59 H54"
          : effective === "encouraging"
            ? "M40 58 Q48 63 56 58"
            : "M41 59 Q48 61 55 59"

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
          {/* jacket */}
          <path
            d="M20 90 C 28 68, 68 68, 76 90 Z"
            fill="oklch(0.28 0.03 250)"
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
          {/* shirt */}
          <path
            d="M42 78 L48 90 L54 78 Z"
            fill="oklch(0.97 0.005 90)"
            stroke="var(--ink)"
            strokeWidth="1.2"
          />
          {/* neck */}
          <rect x="44" y="68" width="8" height="12" fill="oklch(0.90 0.03 70)" stroke="var(--ink)" strokeWidth="1" />
          {/* head */}
          <ellipse
            cx="48"
            cy="46"
            rx="24"
            ry="26"
            fill="oklch(0.90 0.03 70)"
            stroke="var(--ink)"
            strokeWidth="1.75"
          />
          {/* balding crown highlight */}
          <ellipse cx="48" cy="28" rx="14" ry="8" fill="oklch(0.94 0.02 70)" />
          {/* side hair */}
          <path
            d="M24 48 C 22 34, 30 24, 38 22"
            fill="none"
            stroke="oklch(0.55 0.03 60)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M72 48 C 74 34, 66 24, 58 22"
            fill="none"
            stroke="oklch(0.55 0.03 60)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* round glasses */}
          <circle cx="38" cy="46" r="9" fill="oklch(0.97 0.01 90 / 0.35)" stroke="var(--ink)" strokeWidth="1.7" />
          <circle cx="58" cy="46" r="9" fill="oklch(0.97 0.01 90 / 0.35)" stroke="var(--ink)" strokeWidth="1.7" />
          <path d="M47 46 H49" stroke="var(--ink)" strokeWidth="1.6" />
          <path d="M29 45 H22" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M67 45 H74" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
          {/* eyes */}
          <circle cx="38" cy="46" r="2" fill="var(--ink)" />
          <circle cx="58" cy="46" r="2" fill="var(--ink)" />
          {/* brows */}
          <path d={brow} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
          <path d={brow2} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
          {/* nose */}
          <path
            d="M48 48 L46 54 L50 54"
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
              <circle cx="78" cy="24" r="5" fill="none" stroke="var(--graphite)" strokeWidth="1.4" />
              <circle cx="86" cy="16" r="3" fill="none" stroke="var(--graphite)" strokeWidth="1.2" />
            </>
          ) : null}
          {effective === "celebrating" ? (
            <path
              d="M18 20 L22 12 M28 22 L32 14 M70 20 L74 12"
              fill="none"
              stroke="oklch(0.55 0.12 75)"
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
