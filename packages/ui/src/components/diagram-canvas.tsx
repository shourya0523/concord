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

let mermaidId = 0

/**
 * Host for Mermaid / interactive finance diagrams (DESIGN.md §12 — diagrams
 * are first-class teaching media). Mermaid is dynamically imported so the
 * renderer only ships to pages that actually show a diagram. Paper-styled:
 * cream nodes, ink strokes, Geist labels.
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
  const [svg, setSvg] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    if (!source || reduced) return
    let cancelled = false
    const id = `diagram-canvas-${++mermaidId}`
    void import("mermaid")
      .then((module) => {
        const mermaid = module.default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#f7f1e4",
            primaryColor: "#f7f1e4",
            primaryBorderColor: "#111111",
            primaryTextColor: "#111111",
            lineColor: "#111111",
            secondaryColor: "#ebe4d4",
            tertiaryColor: "#ebe4d4",
            fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
            fontSize: "14px",
          },
          flowchart: { htmlLabels: true, curve: "basis" },
        })
        return mermaid.render(id, source)
      })
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch((error: unknown) => {
        console.warn("[diagram] mermaid render failed", error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      // mermaid leaves an error element in the DOM on parse failures
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(id)?.remove()
    }
  }, [source, reduced])

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
          (svg ? (
            <div
              className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : failed ? (
            (fallback ?? null)
          ) : source ? (
            <p className="text-sm text-muted-foreground">Drawing diagram…</p>
          ) : (
            (fallback ?? (
              <p className="text-sm text-muted-foreground">
                Diagram host ready — attach Mermaid or interactive SVG.
              </p>
            ))
          ))}
      </div>
    </figure>
  )
}

export { DiagramCanvas }
