"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion, seedFrom } from "@/lib/mockups/motion"

import { Paperclip } from "./paperclip"

export type TallyMark = "goal" | "freeze"

/** Marks drawn at once; older ones collapse into "+N earlier". */
const VISIBLE_MARKS = 30
const GAP = 11
const GROUP_ADVANCE = 3 * GAP + 30
const HEIGHT = 74

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One pen stroke: a gentle curve with a little lean, never a ruler line. */
function strokePath(x1: number, y1: number, x2: number, y2: number, r: () => number, bend: number) {
  const mx = (x1 + x2) / 2 + (r() - 0.5) * bend
  const my = (y1 + y2) / 2 + (r() - 0.5) * bend
  const f = (n: number) => n.toFixed(1)
  return `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`
}

type Stroke = { d: string; mark: TallyMark; width: number; opacity: number; labelX: number; closes: boolean }

/**
 * Tally layout: four uprights, then a fifth stroke across them closes the
 * group (strike-through = completed, DESIGN.md semantic map). Each stroke's
 * jitter is seeded by its absolute position in the run, so adding a day never
 * redraws earlier marks.
 */
/** `offset` must be a multiple of 5 so groups stay aligned. */
export function layoutTally(marks: TallyMark[], offset = 0): { strokes: Stroke[]; width: number } {
  const strokes: Stroke[] = []
  let gx = 18
  marks.forEach((mark, i) => {
    const absolute = offset + i
    const r = seeded(seedFrom(`tally-${absolute}`))
    const pos = absolute % 5
    let d: string
    let labelX: number
    if (pos < 4) {
      const x = gx + pos * GAP + (r() - 0.5) * 1.6
      const top = 10 + r() * 4
      const bottom = 50 + r() * 3
      const lean = (r() - 0.5) * 3.2
      d = strokePath(x + lean, top, x - lean * 0.3, bottom, r, 2.2)
      labelX = x
    } else {
      // Starts left of the first upright, ends right of the fourth, rising.
      d = strokePath(gx - 6, 45 + r() * 3, gx + 3 * GAP + 7, 17 + r() * 3, r, 3)
      labelX = gx + 1.5 * GAP
    }
    strokes.push({
      d,
      mark,
      width: mark === "freeze" ? 1.5 : pos === 4 ? 2.3 : 2 + r() * 0.35,
      opacity: mark === "freeze" ? 1 : 0.86 + r() * 0.12,
      labelX,
      closes: pos === 4,
    })
    if (pos === 4) gx += GROUP_ADVANCE
  })
  const lastPos = (offset + marks.length - 1) % 5
  const width = marks.length === 0 ? 40 : gx + (lastPos === 4 ? 0 : 4 * GAP) + 20
  return { strokes, width }
}

/**
 * Desk calendar streak (DESIGN.md §16): goal days in ink, freeze-covered days
 * in pencil, freezes in reserve as paperclips on the top edge. `drawLatest`
 * pen-draws the newest mark once — only after a confirmed goal.
 */
export function TallyCalendar({
  current,
  longest,
  freezes,
  run,
  goalMetToday,
  drawLatest = false,
  freezeJustEarned = false,
  monthLabel,
  className,
}: {
  current: number
  longest: number
  freezes: number
  run?: TallyMark[]
  goalMetToday: boolean
  drawLatest?: boolean
  freezeJustEarned?: boolean
  monthLabel?: string
  className?: string
}) {
  // Fallback when the run isn't available: one ink mark per streak day.
  const marks: TallyMark[] = run && run.length > 0 ? run : Array.from({ length: Math.min(current, 60) }, () => "goal")
  const hidden = Math.max(0, marks.length - VISIBLE_MARKS)
  // Hide whole groups so the visible tally still starts on a group boundary.
  const skip = hidden > 0 ? Math.ceil(hidden / 5) * 5 : 0
  const visible = marks.slice(skip)
  const { strokes, width } = layoutTally(visible, skip)
  const latestRef = React.useRef<SVGPathElement>(null)

  React.useEffect(() => {
    const path = latestRef.current
    if (!path || !drawLatest || prefersReducedMotion()) return
    const len = path.getTotalLength()
    path.style.transition = "none"
    path.style.strokeDasharray = `${len} ${len}`
    path.style.strokeDashoffset = String(len)
    path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 320ms ease-out"
    path.style.strokeDashoffset = "0"
  }, [drawLatest, marks.length])

  const freezeLabel =
    freezes === 0 ? "Freeze every 7 days" : freezes === 1 ? "1 freeze in reserve" : `${freezes} freezes in reserve`
  const goalDays = marks.filter((m) => m === "goal").length
  const frozenDays = marks.length - goalDays

  return (
    <section
      className={cn("relative space-y-2 bg-sheet bg-[image:var(--paper-grain)] px-4 py-4 [filter:drop-shadow(0_1px_0.5px_var(--sheet-shadow))]", className)}
      aria-label="Streak calendar"
      data-testid="tally-calendar"
    >
      {freezes > 0 ? (
        <div className="absolute -top-3 right-5 flex gap-1" aria-hidden>
          {Array.from({ length: freezes }, (_, i) => (
            <Paperclip key={i} slide={freezeJustEarned && i === freezes - 1} />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2 pr-12">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Desk calendar{monthLabel ? ` · ${monthLabel}` : ""}
        </p>
        <p className="font-mono text-[11px] tracking-[0.14em] text-streak-foreground uppercase">{freezeLabel}</p>
      </div>
      <p className="flex items-end gap-3">
        <span className="font-display text-4xl leading-none tabular-nums" data-testid="streak-current">
          {current}
        </span>
        <span className="pb-0.5 text-sm text-muted-foreground">
          day{current === 1 ? "" : "s"} running · best {Math.max(longest, current)}
        </span>
      </p>
      {visible.length > 0 ? (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width={width * 1.15}
            height={HEIGHT * 1.15}
            className="block max-w-none overflow-visible"
            role="img"
            aria-label={`${goalDays} goal day${goalDays === 1 ? "" : "s"}${frozenDays ? `, ${frozenDays} held by a freeze` : ""}${goalMetToday ? ", including today" : ""}.`}
          >
            {strokes.map((stroke, i) => {
              const latest = i === strokes.length - 1
              return (
                <path
                  key={i}
                  ref={latest ? latestRef : undefined}
                  d={stroke.d}
                  fill="none"
                  stroke={stroke.mark === "freeze" ? "var(--pencil)" : "var(--ink)"}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  opacity={stroke.opacity}
                  data-mark={stroke.mark}
                />
              )
            })}
            {strokes.map((stroke, i) =>
              stroke.mark === "freeze" ? (
                <text key={`f${i}`} x={stroke.labelX} y={71} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="8.5">
                  held
                </text>
              ) : null,
            )}
            {goalMetToday && strokes.length > 0 ? (
              <text
                x={strokes[strokes.length - 1]!.labelX}
                y={71}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize="8.5"
              >
                today
              </text>
            ) : null}
          </svg>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Meet today&apos;s goal to make the first mark.</p>
      )}
      {skip > 0 ? (
        <p className="font-mono text-[10px] text-muted-foreground">+{skip} earlier days in this run</p>
      ) : null}
    </section>
  )
}
