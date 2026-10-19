"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

export type DiagramCanvasProps = {
  title?: string
  /** Mermaid source. Interactive-json bodies are never handed to Mermaid. */
  source?: string
  /**
   * Body format. `interactive-json` (or a source that is a JSON object) skips
   * Mermaid entirely and renders `children` / `fallback` instead — use
   * DiagramFillBlank for those bodies.
   */
  format?: "mermaid" | "interactive-json"
  /** Prefer interactive host when false and motion allowed */
  fallback?: React.ReactNode
  reducedMotionFallback?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

let mermaidId = 0

/** True when a body must not be passed to Mermaid (interactive-json diagrams). */
export function isInteractiveDiagramSource(
  source: string | undefined,
  format?: DiagramCanvasProps["format"]
): boolean {
  if (format === "interactive-json") return true
  const trimmed = source?.trimStart() ?? ""
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}

/**
 * Host for Mermaid / interactive finance diagrams (DESIGN.md §12 — diagrams
 * are first-class teaching media). Mermaid is dynamically imported so the
 * renderer only ships to pages that actually show a diagram. Paper-styled:
 * cream nodes, ink strokes, Geist labels.
 */
function DiagramCanvas({
  title = "Diagram",
  source,
  format,
  fallback,
  reducedMotionFallback,
  className,
  children,
}: DiagramCanvasProps) {
  const [reduced, setReduced] = React.useState(false)
  const [svg, setSvg] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const interactive = isInteractiveDiagramSource(source, format)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  React.useEffect(() => {
    if (!source || reduced || interactive) return
    let cancelled = false
    let settled = false
    const id = `diagram-canvas-${++mermaidId}`
    const cleanupDom = () => {
      // mermaid leaves an error element in the DOM on parse failures
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(id)?.remove()
    }
    void import("mermaid")
      .then((module) => {
        // StrictMode / fast re-renders: skip work for an effect already cleaned up.
        if (cancelled) return null
        const mermaid = module.default
        const styles = getComputedStyle(document.documentElement)
        const paper = styles.getPropertyValue("--paper").trim() || "#f7f1e4"
        const ink = styles.getPropertyValue("--ink").trim() || "#111111"
        const secondary = styles.getPropertyValue("--secondary").trim() || "#ebe4d4"
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: paper,
            primaryColor: paper,
            primaryBorderColor: ink,
            primaryTextColor: ink,
            lineColor: ink,
            secondaryColor: secondary,
            tertiaryColor: secondary,
            fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
            fontSize: "14px",
          },
          flowchart: { htmlLabels: true, curve: "basis" },
        })
        return mermaid.render(id, source)
      })
      .then((result) => {
        if (result && !cancelled) setSvg(result.svg)
      })
      .catch((error: unknown) => {
        console.warn("[diagram] mermaid render failed", error)
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        settled = true
        if (cancelled) cleanupDom()
      })
    return () => {
      cancelled = true
      // Never pull DOM out from under an in-flight render (it stalls mermaid's
      // render queue); the finally above cleans up once it settles.
      if (settled) cleanupDom()
    }
  }, [source, reduced, interactive])

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
          ) : failed || interactive ? (
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
