"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

export type DiagramCanvasProps = {
  title?: string
  /** Mermaid or other diagram source — rendered by host when available */
  source?: string
  /** Prefer interactive host when false and motion allowed */
  fallback?: React.ReactNode
  reducedMotionFallback?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * Host for Mermaid / interactive finance diagrams.
 * Stub: shows source in a terminal panel; Wave 2 wires Mermaid renderer.
 */
function DiagramCanvas({
  title = "Diagram",
  source,
  fallback,
  reducedMotionFallback,
  className,
  children,
}: DiagramCanvasProps) {
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (reduced && reducedMotionFallback) {
    return (
      <div data-slot="diagram-canvas" data-reduced-motion className={cn("w-full", className)}>
        {reducedMotionFallback}
      </div>
    )
  }

  return (
    <figure
      data-slot="diagram-canvas"
      className={cn(
        "bg-card border-border w-full overflow-hidden rounded-[16px] border",
        className
      )}
    >
      <figcaption className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {title}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">canvas</span>
      </figcaption>
      <div className="min-h-[12rem] p-4">
        {children ??
          fallback ??
          (source ? (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {source}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Diagram host ready — attach Mermaid or interactive SVG.
            </p>
          ))}
      </div>
    </figure>
  )
}

export { DiagramCanvas }
