"use client"

import { DiagramCanvas } from "@ibpe/ui/components/diagram-canvas"

type Props = {
  title: string
  source: string
  a11yFallback: string
  className?: string
}

/** Client island for diagram canvas + reduced-motion / a11y fallback. */
export function DiagramIsland({ title, source, a11yFallback, className }: Props) {
  return (
    <DiagramCanvas
      title={title}
      source={source}
      className={className}
      reducedMotionFallback={
        <div className="border-border bg-card rounded-[16px] border p-4">
          <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {title} · text fallback
          </p>
          <p className="text-sm leading-relaxed text-foreground">{a11yFallback}</p>
        </div>
      }
      fallback={
        <div className="space-y-3">
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {source}
          </pre>
          <details className="text-sm">
            <summary className="cursor-pointer font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Accessible description
            </summary>
            <p className="mt-2 text-foreground/90">{a11yFallback}</p>
          </details>
        </div>
      }
    />
  )
}
