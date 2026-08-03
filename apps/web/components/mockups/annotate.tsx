"use client"

import * as React from "react"
import { annotate } from "rough-notation"

import { cn } from "@ibpe/ui/lib/utils"

import { prefersReducedMotion } from "@/lib/mockups/motion"

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
}

const SEMANTIC_COLORS: Partial<Record<AnnotationType, string>> = {
  circle: "var(--lime)",
  underline: "var(--ink)",
  highlight: "var(--success)",
  "strike-through": "var(--error)",
  "crossed-off": "var(--graphite)",
  box: "var(--ink)",
  bracket: "var(--milestone)",
}

/**
 * rough-notation wrapper enforcing semantic map + prefers-reduced-motion.
 *
 * The library inserts an absolutely-positioned SVG as a sibling of the
 * annotated node. Without a positioned ancestor, that SVG is anchored to the
 * initial containing block and drifts when surrounding layout reflows (e.g.
 * dashboard firm-readiness rows shrinking when fewer targets are selected).
 * The relative wrapper keeps the mark glued to the annotated content.
 */
export function Annotate({
  type,
  children,
  show = true,
  color,
  className,
  strokeWidth = 2,
  padding = 4,
}: AnnotateProps) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el || !show) return

    const config: RoughAnnotationConfig = {
      type,
      color: color ?? SEMANTIC_COLORS[type] ?? "var(--ink)",
      strokeWidth,
      padding,
      animate: !prefersReducedMotion(),
      animationDuration: 600,
      multiline: true,
    }
    const annotation = annotate(el, config)
    annotation.show()

    // Library only ResizeObserves the annotated node; parent size changes that
    // move the node (without resizing it) need an explicit refresh.
    let refreshTimer = 0
    const refresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (annotation.isShowing()) annotation.show()
      }, 50)
    }
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null
    let ancestor = el.parentElement
    while (ancestor && ancestor !== document.documentElement) {
      ro?.observe(ancestor)
      ancestor = ancestor.parentElement
    }

    return () => {
      window.clearTimeout(refreshTimer)
      ro?.disconnect()
      annotation.remove()
    }
  }, [type, show, color, strokeWidth, padding])

  return (
    <span className={cn("relative", className)} data-annotation-root={type}>
      <span ref={ref} data-annotation={type}>
        {children}
      </span>
    </span>
  )
}
