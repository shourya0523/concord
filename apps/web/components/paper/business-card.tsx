import { cn } from "@ibpe/ui/lib/utils"

/**
 * Level as a title on a business card (DESIGN.md §16 career ladder). The XP
 * line is calm: the bar eases, the number swaps, nothing counts up or bounces.
 */
export function BusinessCard({
  title,
  nextTitle,
  level,
  track,
  xp,
  floor,
  next,
  className,
}: {
  title: string
  nextTitle: string
  level: number
  track: "IB" | "PE"
  xp: number
  floor: number
  next: number
  className?: string
}) {
  const span = Math.max(1, next - floor)
  const pct = Math.min(100, Math.max(0, ((xp - floor) / span) * 100))
  return (
    <section
      aria-label={`Level ${level}: ${title}`}
      data-testid="business-card"
      className={cn(
        "paper-lift relative grid min-h-44 max-w-[24rem] -rotate-1 grid-rows-[auto_1fr_auto] gap-3 rounded-[2px] bg-[#fffdf8] bg-[image:var(--paper-grain)] px-6 pt-5 pb-4 [filter:drop-shadow(0_1px_0.6px_var(--sheet-shadow))_drop-shadow(0_8px_14px_rgb(60_45_20/0.08))] hover:rotate-0",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg">Concord</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {track === "PE" ? "PE track" : "IB track"}
        </span>
      </div>
      <div className="self-center">
        <p className="font-display text-3xl leading-none tracking-tight md:text-4xl" data-testid="career-title">
          {title}
        </p>
        <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Level {level} · {track === "PE" ? "Private Equity" : "Investment Banking"}
        </p>
      </div>
      <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
        <div className="flex justify-between gap-3">
          <span>
            {xp} / {next} XP
          </span>
          <span>{nextTitle} next</span>
        </div>
        <div className="relative h-[3px] bg-stone" aria-hidden>
          <i
            className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-[var(--duration-control)] ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  )
}
