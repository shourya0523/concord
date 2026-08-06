import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { heatClassName, type HeatLevel } from "@ibpe/ui/lib/tokens"

export type TopicHeatCell = {
  firmId: string
  firmSlug?: string
  firmLabel: string
  topicId: string
  topicLabel: string
  intensity: HeatLevel
  weak?: boolean
  count?: number
}

export type TopicHeatmapProps = {
  firms: { id: string; label: string }[]
  topics: { id: string; label: string }[]
  cells: TopicHeatCell[]
  compareMode?: boolean
  onCellActivate?: (cell: TopicHeatCell) => void
  className?: string
  /** Left-to-right column reveal on mount (default on). */
  animateReveal?: boolean
}

function cellKey(firmId: string, topicId: string) {
  return `${firmId}::${topicId}`
}

const REVEAL_MS = 420
const STAGGER_MS = 80

function revealStyle(columnIndex: number, enabled: boolean): React.CSSProperties | undefined {
  if (!enabled) return undefined
  return {
    animation: `heat-reveal-ltr ${REVEAL_MS}ms var(--ease-calm) ${columnIndex * STAGGER_MS}ms both`,
  }
}

/**
 * Firm × topic intensity grid with weakness overlay.
 * Colour is not the only encoding — heat level (1–4) + report count + optional hatch for weak.
 */
function TopicHeatmap({
  firms,
  topics,
  cells,
  compareMode = false,
  onCellActivate,
  className,
  animateReveal = true,
}: TopicHeatmapProps) {
  const lookup = React.useMemo(() => {
    const map = new Map<string, TopicHeatCell>()
    for (const cell of cells) {
      map.set(cellKey(cell.firmId, cell.topicId), cell)
    }
    return map
  }, [cells])

  return (
    <div
      data-slot="topic-heatmap"
      data-compare={compareMode || undefined}
      data-reveal={animateReveal || undefined}
      data-firm-count={firms.length || undefined}
      className={cn("relative w-full overflow-x-auto", className)}
      role="grid"
      aria-label="Topic heat by firm"
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr role="row">
            <th
              scope="col"
              className="w-[9.5rem] border-b border-border px-2 py-2 text-left font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase"
              style={revealStyle(0, animateReveal)}
            >
              Topic / Firm
            </th>
            {firms.map((firm, firmIndex) => (
              <th
                key={firm.id}
                scope="col"
                title={firm.label}
                className="border-b border-border px-1.5 py-2 text-left font-medium text-foreground"
                style={revealStyle(firmIndex + 1, animateReveal)}
              >
                <span className="block truncate">{firm.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.id} role="row">
              <th
                scope="row"
                title={topic.label}
                className="border-b border-border/70 px-2 py-1.5 text-left font-normal text-muted-foreground"
                style={revealStyle(0, animateReveal)}
              >
                <span className="block truncate">{topic.label}</span>
              </th>
              {firms.map((firm, firmIndex) => {
                const cell = lookup.get(cellKey(firm.id, topic.id))
                const intensity = cell?.intensity ?? 0
                const weak = Boolean(cell?.weak)
                const reportCount = cell?.count
                const reportsLabel =
                  typeof reportCount === "number"
                    ? reportCount === 1
                      ? "1 interview report"
                      : `${reportCount} interview reports`
                    : null
                const label = [
                  `${topic.label} at ${firm.label}`,
                  `heat ${intensity} of 4 (how often this topic comes up)`,
                  reportsLabel,
                  weak ? "weak topic for you" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
                return (
                  <td
                    key={firm.id}
                    className="border-b border-border/70 p-1"
                    role="gridcell"
                    style={revealStyle(firmIndex + 1, animateReveal)}
                  >
                    <button
                      type="button"
                      aria-label={label}
                      disabled={!onCellActivate}
                      onClick={() => cell && onCellActivate?.(cell)}
                      title={label}
                      className={cn(
                        "relative flex h-12 w-full min-w-0 flex-col items-center justify-center rounded-[8px] font-mono text-[11px] transition-[transform,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-terminal)]",
                        heatClassName[intensity],
                        weak &&
                          "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,color-mix(in_oklch,var(--weak)_35%,transparent)_3px,color-mix(in_oklch,var(--weak)_35%,transparent)_6px)]",
                        onCellActivate &&
                          "cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
                        !onCellActivate && "cursor-default",
                      )}
                    >
                      <span className="relative z-[1] text-ink/80 dark:text-ink/90">
                        {intensity}
                      </span>
                      {typeof reportCount === "number" ? (
                        <span className="relative z-[1] text-[9px] leading-none text-ink/65 dark:text-ink/80">
                          {reportCount === 1 ? "1 report" : `${reportCount} reports`}
                        </span>
                      ) : null}
                      {weak ? (
                        <span className="sr-only">Marked as weak topic</span>
                      ) : null}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { TopicHeatmap }
