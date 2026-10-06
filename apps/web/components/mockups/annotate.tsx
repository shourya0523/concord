"use client"

import * as React from "react"
import { annotate } from "rough-notation"

import { cn } from "@ibpe/ui/lib/utils"

import { prefersReducedMotion, resolveCssColor } from "@/lib/mockups/motion"

type RoughAnnotationConfig = Parameters<typeof annotate>[1]

export type AnnotationType =
  | "underline"
  | "box"
  | "circle"
  | "highlight"
  | "strike-through"
  | "crossed-off"
  | "bracket"

type AnnotateProps = {
  type: AnnotationType
  children: React.ReactNode
  /** Fire only when true — state-confirmed reactions (DESIGN.md). */
  show?: boolean
  color?: string
  className?: string
  strokeWidth?: number
  padding?: number
  /**
   * Set when children are block-level (div/p/ul rows). Inline wrappers around
   * blocks produce fragmented client rects, so marks land in the wrong place.
   */
  block?: boolean
}

/** Semantic map defaults (DESIGN.md §7) — same mark, same meaning everywhere. */
const SEMANTIC_COLORS: Record<AnnotationType, string> = {
  circle: "var(--ink)",
  underline: "var(--ink)",
  highlight: "var(--success)",
  "strike-through": "var(--error-foreground)",
  "crossed-off": "var(--graphite)",
  box: "var(--ink)",
  bracket: "var(--graphite)",
}

/**
 * Text marks follow each wrapped line; unit marks (box / circle / bracket /
 * crossed-off) wrap the whole element once. Multiline brackets drew one
 * bracket per line and multiline circles one ellipse per line.
 */
const LINE_MARKS = new Set<AnnotationType>(["underline", "highlight", "strike-through"])

/**
 * rough-notation wrapper enforcing semantic map + prefers-reduced-motion.
 *
 * The library inserts an absolutely-positioned SVG as a sibling of the
 * annotated node. The relative wrapper keeps that SVG anchored to the
 * annotated content when surrounding layout reflows.
 */
export function Annotate({
  type,
  children,
  show = true,
  color,
  className,
  strokeWidth,
  padding,
  block = false,
}: AnnotateProps) {
  const ref = React.useRef<HTMLElement>(null)
  const lineMark = LINE_MARKS.has(type)

  React.useEffect(() => {
    const el = ref.current
    if (!el || !show) return

    const config: RoughAnnotationConfig = {
      type,
      // Resolve var(--token) to a concrete colour: SVG presentation attributes
      // don't resolve custom properties consistently across engines.
      color: resolveCssColor(el, color ?? SEMANTIC_COLORS[type]),
      strokeWidth: strokeWidth ?? (type === "highlight" ? 1 : 1.75),
      padding: padding ?? (type === "highlight" ? 1 : type === "circle" ? 6 : type === "box" ? 5 : 3),
      animate: !prefersReducedMotion(),
      animationDuration: type === "highlight" ? 800 : 600,
      multiline: lineMark,
      iterations: type === "highlight" ? 1 : 2,
    }
    const annotation = annotate(el, config)
    annotation.show()

    // The library only observes the annotated node itself. Ancestors that
    // move it without resizing it (reflow, reveal, font swap) need a refresh.
    let refreshTimer = 0
    const refresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (annotation.isShowing()) annotation.show()
      }, 60)
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null
    let ancestor = el.parentElement
    while (ancestor && ancestor !== document.body) {
      ro?.observe(ancestor)
      ancestor = ancestor.parentElement
    }
    // Web fonts change glyph metrics after first paint.
    document.fonts?.ready.then(refresh).catch(() => {})

    return () => {
      window.clearTimeout(refreshTimer)
      ro?.disconnect()
      annotation.remove()
    }
  }, [type, show, color, strokeWidth, padding, lineMark])

  if (block) {
    return (
      <div className={cn("relative", className)} data-annotation-root={type}>
        <div ref={ref as React.RefObject<HTMLDivElement>} data-annotation={type}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <span
      className={cn("relative", lineMark ? "inline" : "inline-block", className)}
      data-annotation-root={type}
    >
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        data-annotation={type}
        // Unit marks need one clean box; line marks follow the text flow.
        className={lineMark ? undefined : "inline-block"}
      >
        {children}
      </span>
    </span>
  )
}
