import { cn } from "@ibpe/ui/lib/utils"
import { topicLabel } from "@/lib/topics"

export type HeatStripEntry = {
  topic: string
  /** 0–1 intensity. */
  intensity: number
  /** Occurrence sample size — always shown (never color alone). */
  sampleSize: number
  weak?: boolean
}

const HEAT_CLASSES = [
  "bg-heat-0 text-muted-foreground",
  "bg-heat-1 text-foreground",
  "bg-heat-2 text-foreground",
  "bg-heat-3 text-foreground",
  "bg-heat-4 text-foreground",
]

export function intensityBand(intensity: number): 0 | 1 | 2 | 3 | 4 {
  if (intensity <= 0.05) return 0
  if (intensity < 0.3) return 1
  if (intensity < 0.55) return 2
  if (intensity < 0.8) return 3
  return 4
}

/**
 * Mini firm×topic intensity strip (onboarding preview, module heat strip).
 * Numeric intensity + N caption; hatch overlay marks weak topics.
 */
export function HeatStrip({
  entries,
  className,
  compact = false,
}: {
  entries: HeatStripEntry[]
  className?: string
  compact?: boolean
}) {
  if (entries.length === 0) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Topic heat preview">
      {entries.map((entry) => {
        const band = intensityBand(entry.intensity)
        return (
          <li
            key={entry.topic}
            className={cn(
              "relative overflow-hidden rounded-md border border-black/15 font-mono",
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
              HEAT_CLASSES[band],
            )}
            title={`${topicLabel(entry.topic)} · intensity ${entry.intensity.toFixed(2)} · n=${entry.sampleSize}`}
          >
            {entry.weak ? (
              <span
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,var(--weak)_3px,var(--weak)_4px)] opacity-35"
              />
            ) : null}
            <span className="relative">
              {topicLabel(entry.topic)} · {entry.intensity.toFixed(2)}
              <span className="text-muted-foreground/80"> n={entry.sampleSize}</span>
              {entry.weak ? <span className="sr-only"> (weak topic)</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
