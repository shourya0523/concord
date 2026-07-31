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
 * Warren — Concord coach sprite (DESIGN.md §6).
 * Art sheets: /public/mockups/warren/*.png — runtime is layered SVG.
 * Open polish: closer cheek volume, hair mass, frame weight vs sheets.
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
  const brows =
    mood === "concerned"
      ? { left: "M28 39 Q37 36 45 40", right: "M51 40 Q59 36 68 39" }
      : mood === "celebrating" || mood === "encouraging"
        ? { left: "M28 37 Q37 34 45 37", right: "M51 37 Q59 34 68 37" }
        : mood === "thinking"
          ? { left: "M28 38 Q37 35 45 38", right: "M51 39 Q59 36 68 38" }
          : { left: "M28 38.5 Q37 36 45 38.5", right: "M51 38.5 Q59 36 68 38.5" }

  const mouth =
    mood === "celebrating"
      ? "M37 61 Q48 70 59 61"
      : mood === "encouraging"
        ? "M38 61 Q48 66 58 61"
        : mood === "concerned"
          ? "M38 63 Q48 59 58 63"
          : mood === "thinking"
            ? "M40 62 H56"
            : mood === "paused"
              ? "M39 62 Q48 63 57 62"
              : "M38 61 Q48 64 58 61"

  return (
    <svg viewBox="0 0 96 96" width="100%" height="100%" role="img">
      <title>Warren</title>

      <g id="warren-body">
        <path
          d="M16 94 C 24 68, 72 68, 80 94 Z"
          fill="oklch(0.30 0.045 250)"
          stroke="var(--ink)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {/* cardigan fold */}
        <path
          d="M40 78 Q48 86 56 78"
          fill="none"
          stroke="oklch(0.22 0.04 250)"
          strokeWidth="1.2"
        />
        <path
          d="M39 76 L48 94 L57 76 Z"
          fill="oklch(0.97 0.01 90)"
          stroke="var(--ink)"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M42 66 C 42 72, 54 72, 54 66"
        fill="oklch(0.88 0.035 70)"
        stroke="var(--ink)"
        strokeWidth="1.15"
      />

      <g id="warren-head">
        <ellipse
          cx="48"
          cy="44"
          rx="27"
          ry="29"
          fill="oklch(0.88 0.035 70)"
          stroke="var(--ink)"
          strokeWidth="1.8"
        />
        {/* cheek warmth */}
        <ellipse cx="30" cy="52" rx="5" ry="3.5" fill="oklch(0.84 0.05 45 / 0.35)" />
        <ellipse cx="66" cy="52" rx="5" ry="3.5" fill="oklch(0.84 0.05 45 / 0.35)" />
        {/* bald crown */}
        <ellipse cx="48" cy="24" rx="16" ry="10" fill="oklch(0.92 0.025 70)" />
      </g>

      <g id="warren-hair" fill="oklch(0.86 0.01 90)" stroke="var(--ink)" strokeWidth="1.25">
        <path d="M21 50 C 18 36, 26 20, 38 18 C 30 32, 26 42, 24 56 Z" />
        <path d="M75 50 C 78 36, 70 20, 58 18 C 66 32, 70 42, 72 56 Z" />
        {/* ear tufts */}
        <path d="M22 54 C 18 56, 18 62, 23 60" fill="oklch(0.86 0.01 90)" />
        <path d="M74 54 C 78 56, 78 62, 73 60" fill="oklch(0.86 0.01 90)" />
      </g>

      <g id="warren-glasses" fill="oklch(0.97 0.01 90 / 0.25)" stroke="var(--ink)" strokeWidth="2">
        <circle cx="36" cy="45" r="10.5" />
        <circle cx="60" cy="45" r="10.5" />
        <path d="M46.5 45 H49.5" strokeWidth="1.8" />
        <path d="M25.5 44 H18" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <path d="M70.5 44 H78" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>

      <g id="warren-eyes" fill="var(--ink)">
        <circle cx="36" cy="45" r="2.4" />
        <circle cx="60" cy="45" r="2.4" />
        <circle cx="35.2" cy="44.2" r="0.6" fill="oklch(0.98 0.01 90)" />
        <circle cx="59.2" cy="44.2" r="0.6" fill="oklch(0.98 0.01 90)" />
      </g>

      <g
        id={`warren-brows-${mood}`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.85"
        strokeLinecap="round"
      >
        <path d={brows.left} />
        <path d={brows.right} />
      </g>

      <path
        d="M48 47 L45 54 L51 54"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        id={`warren-mouth-${mood}`}
        d={mouth}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />

      {mood === "thinking" ? (
        <g id="warren-prop-thinking" fill="none" stroke="var(--graphite)" strokeWidth="1.45">
          <circle cx="80" cy="20" r="5.5" />
          <circle cx="88" cy="12" r="3.2" />
        </g>
      ) : null}
      {mood === "celebrating" ? (
        <g
          id="warren-prop-celebrating"
          fill="none"
          stroke="oklch(0.55 0.12 75)"
          strokeWidth="2.1"
          strokeLinecap="round"
        >
          <path d="M14 20 L18 11" />
          <path d="M24 22 L28 13" />
          <path d="M72 18 L76 10" />
        </g>
      ) : null}
    </svg>
  )
}
