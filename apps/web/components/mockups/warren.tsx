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
 * Warren — Concord's fixed coach sprite.
 * Art direction: /public/mockups/warren/*.png + DESIGN.md §6.
 * Construction: stable body/head/glasses; mood swaps brows + mouth + prop only.
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
        <WarrenSvg mood={effective} />
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

function WarrenSvg({ mood }: { mood: WarrenMood }) {
  const browIdle = {
    left: "M30 40 Q38 37 46 40",
    right: "M50 40 Q58 37 66 40",
  }
  const brows =
    mood === "concerned"
      ? { left: "M30 41 Q38 38 46 42", right: "M50 42 Q58 38 66 41" }
      : mood === "celebrating" || mood === "encouraging"
        ? { left: "M30 38 Q38 35 46 38", right: "M50 38 Q58 35 66 38" }
        : mood === "thinking"
          ? { left: "M30 39 Q38 36 46 39", right: "M50 40 Q58 37 66 39" }
          : browIdle

  const mouth =
    mood === "celebrating"
      ? "M38 60 Q48 68 58 60"
      : mood === "encouraging"
        ? "M39 60 Q48 65 57 60"
        : mood === "concerned"
          ? "M39 62 Q48 58 57 62"
          : mood === "thinking"
            ? "M40 61 H56"
            : mood === "paused"
              ? "M40 61 Q48 62 56 61"
              : "M39 60 Q48 63 57 60"

  return (
    <svg viewBox="0 0 96 96" width="100%" height="100%" role="img">
      <title>Warren</title>

      {/* —— body (fixed) —— */}
      <g id="warren-body">
        <path
          d="M18 92 C 26 70, 70 70, 78 92 Z"
          fill="oklch(0.32 0.04 250)"
          stroke="var(--ink)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M40 78 L48 92 L56 78 Z"
          fill="oklch(0.96 0.01 90)"
          stroke="var(--ink)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </g>

      {/* —— neck —— */}
      <rect
        x="43"
        y="68"
        width="10"
        height="12"
        rx="2"
        fill="oklch(0.88 0.03 70)"
        stroke="var(--ink)"
        strokeWidth="1.1"
      />

      {/* —— head (fixed) —— */}
      <g id="warren-head">
        <ellipse
          cx="48"
          cy="46"
          rx="25"
          ry="27"
          fill="oklch(0.89 0.03 70)"
          stroke="var(--ink)"
          strokeWidth="1.7"
        />
        {/* balding crown */}
        <ellipse cx="48" cy="28" rx="15" ry="9" fill="oklch(0.93 0.02 70)" />
      </g>

      {/* —— hair sides (fixed) —— */}
      <g id="warren-hair" fill="oklch(0.78 0.01 85)" stroke="var(--ink)" strokeWidth="1.2">
        <path d="M23 52 C 20 40, 26 26, 36 22 C 30 34, 28 44, 26 54 Z" />
        <path d="M73 52 C 76 40, 70 26, 60 22 C 66 34, 68 44, 70 54 Z" />
      </g>

      {/* —— glasses on eyes (fixed at UI sizes) —— */}
      <g id="warren-glasses" fill="none" stroke="var(--ink)" strokeWidth="1.7">
        <circle cx="37" cy="46" r="9.5" />
        <circle cx="59" cy="46" r="9.5" />
        <path d="M46.5 46 H49.5" />
        <path d="M27.5 45 H21" strokeLinecap="round" />
        <path d="M68.5 45 H75" strokeLinecap="round" />
      </g>

      {/* —— eyes (fixed pupils; mood doesn't move eyeballs for stability) —— */}
      <g id="warren-eyes" fill="var(--ink)">
        <circle cx="37" cy="46" r="2.2" />
        <circle cx="59" cy="46" r="2.2" />
      </g>

      {/* —— brows (mood) —— */}
      <g id={`warren-brows-${mood}`} fill="none" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round">
        <path d={brows.left} />
        <path d={brows.right} />
      </g>

      {/* —— nose (fixed) —— */}
      <path
        d="M48 48 L45.5 54 L50.5 54"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* —— mouth (mood) —— */}
      <path
        id={`warren-mouth-${mood}`}
        d={mouth}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* —— props (mood) —— */}
      {mood === "thinking" ? (
        <g id="warren-prop-thinking" fill="none" stroke="var(--graphite)" strokeWidth="1.4">
          <circle cx="78" cy="22" r="5" />
          <circle cx="86" cy="14" r="3" />
        </g>
      ) : null}
      {mood === "celebrating" ? (
        <g
          id="warren-prop-celebrating"
          fill="none"
          stroke="oklch(0.55 0.12 75)"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M16 22 L20 14" />
          <path d="M26 24 L30 16" />
          <path d="M70 20 L74 12" />
        </g>
      ) : null}
    </svg>
  )
}
