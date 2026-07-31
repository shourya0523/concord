"use client"

import * as React from "react"
import { annotate } from "rough-notation"

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
    return () => {
      annotation.remove()
    }
  }, [type, show, color, strokeWidth, padding])

  return (
    <span ref={ref} className={className} data-annotation={type}>
      {children}
    </span>
  )
}
