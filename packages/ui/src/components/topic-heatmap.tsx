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
}

function cellKey(firmId: string, topicId: string) {
  return `${firmId}::${topicId}`
}

/**
 * Firm × topic intensity grid with weakness overlay.
 * Colour is not the only encoding — intensity number + optional hatch for weak.
 */
function TopicHeatmap({
  firms,
  topics,
  cells,
  compareMode = false,
  onCellActivate,
  className,
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
      className={cn("w-full overflow-x-auto", className)}
      role="grid"
      aria-label="Topic heat by firm"
    >
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr role="row">
            <th
              scope="col"
              className="border-b border-border px-2 py-2 text-left font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase"
            >
              Topic / Firm
            </th>
            {firms.map((firm) => (
              <th
                key={firm.id}
                scope="col"
                className="border-b border-border px-2 py-2 text-left font-medium text-foreground"
              >
                {firm.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.id} role="row">
              <th
                scope="row"
                className="border-b border-border/70 px-2 py-1.5 text-left font-normal text-muted-foreground"
              >
                {topic.label}
              </th>
              {firms.map((firm) => {
                const cell = lookup.get(cellKey(firm.id, topic.id))
                const intensity = cell?.intensity ?? 0
                const weak = Boolean(cell?.weak)
                const countLabel =
                  typeof cell?.count === "number" ? `, n=${cell.count}` : ""
                const label = `${topic.label} at ${firm.label}: heat ${intensity}${countLabel}${
                  weak ? ", weak topic" : ""
                }`
                return (
                  <td key={firm.id} className="border-b border-border/70 p-1" role="gridcell">
                    <button
                      type="button"
                      aria-label={label}
                      disabled={!onCellActivate}
                      onClick={() => cell && onCellActivate?.(cell)}
                      className={cn(
                        "relative flex h-12 w-full flex-col items-center justify-center rounded-[8px] font-mono text-[11px] transition-[transform,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-terminal)]",
                        heatClassName[intensity],
                        weak &&
                          "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,color-mix(in_oklch,var(--weak)_35%,transparent)_3px,color-mix(in_oklch,var(--weak)_35%,transparent)_6px)]",
                        onCellActivate &&
                          "cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-foreground/50",
                        !onCellActivate && "cursor-default"
                      )}
                    >
                      <span className="relative z-[1] text-ink/80 dark:text-ink/90">
                        {intensity}
                      </span>
                      {typeof cell?.count === "number" ? (
                        <span className="relative z-[1] text-[9px] leading-none text-ink/65 dark:text-ink/80">
                          n={cell.count}
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
