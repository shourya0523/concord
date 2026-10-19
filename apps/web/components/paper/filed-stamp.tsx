import { cn } from "@ibpe/ui/lib/utils"

function stampDate(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  return date
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase()
}

/**
 * Rubber stamp on the morning pack when the daily goal is met (DESIGN.md §16).
 * The only bouncy motion on its screen; `play` only after the server confirms.
 */
export function FiledStamp({
  localDate,
  play = false,
  label = "Filed",
  className,
}: {
  localDate: string
  play?: boolean
  label?: string
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={`${label} ${stampDate(localDate)}`}
      data-testid="filed-stamp"
      className={cn(
        "pointer-events-none inline-grid -rotate-[9deg] gap-1 rounded-[4px] border-[2.5px] border-ink/80 px-3 pt-2 pb-1.5 text-center font-mono text-ink/80 [--stamp-tilt:-9deg] [filter:url(#stamp-ink)]",
        play && "motion-thunk",
        className,
      )}
    >
      <span className="text-[13px] font-semibold tracking-[0.18em] uppercase">{label}</span>
      <span className="text-[9px] font-medium tracking-[0.12em]">{stampDate(localDate)}</span>
    </div>
  )
}
