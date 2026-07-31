"use client"

import * as React from "react"
import { annotate } from "rough-notation"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion } from "@/lib/mockups/motion"

type Ann = ReturnType<typeof annotate>

function inkColor(): string {
  if (typeof window === "undefined") return "#2c2924"
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()
  // rough-notation needs a concrete color; fall back if var unresolved
  if (!raw || raw.startsWith("oklch") || raw.startsWith("var")) return "#2c2924"
  return raw
}

/**
 * Hand-drawn box on hover/focus — preferred over glow/ring (DESIGN.md).
 */
export function RoughHover({
  children,
  className,
  padding = 4,
}: {
  children: React.ReactNode
  className?: string
  padding?: number
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const ann = React.useRef<Ann | null>(null)

  const clear = React.useCallback(() => {
    ann.current?.remove()
    ann.current = null
  }, [])

  const show = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    clear()
    const a = annotate(el, {
      type: "box",
      color: inkColor(),
      strokeWidth: 1.5,
      padding,
      animate: !prefersReducedMotion(),
      animationDuration: prefersReducedMotion() ? 0 : 280,
    })
    ann.current = a
    a.show()
  }, [clear, padding])

  React.useEffect(() => () => clear(), [clear])

  return (
    <span
      ref={ref}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={clear}
      onBlur={clear}
    >
      {children}
    </span>
  )
}

/**
 * Event-delegation: rough box around hovered buttons in a scope (heatmap cells).
 */
export function InkHoverScope({
  children,
  className,
  selector = "button:not(:disabled)",
}: {
  children: React.ReactNode
  className?: string
  selector?: string
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const ann = React.useRef<Ann | null>(null)
  const active = React.useRef<Element | null>(null)

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const clear = () => {
      ann.current?.remove()
      ann.current = null
      active.current = null
    }

    const onOver = (e: Event) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const btn = t.closest(selector)
      if (!btn || !root.contains(btn)) return
      if (active.current === btn) return
      clear()
      active.current = btn
      const a = annotate(btn as HTMLElement, {
        type: "box",
        color: inkColor(),
        strokeWidth: 1.4,
        padding: 2,
        animate: !prefersReducedMotion(),
        animationDuration: prefersReducedMotion() ? 0 : 220,
      })
      ann.current = a
      a.show()
    }

    const onOut = (e: Event) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const btn = t.closest(selector)
      if (!btn || btn !== active.current) return
      const related = (e as MouseEvent).relatedTarget
      if (related instanceof Node && btn.contains(related)) return
      clear()
    }

    root.addEventListener("mouseover", onOver)
    root.addEventListener("mouseout", onOut)
    root.addEventListener("focusin", onOver)
    root.addEventListener("focusout", onOut)
    return () => {
      clear()
      root.removeEventListener("mouseover", onOver)
      root.removeEventListener("mouseout", onOut)
      root.removeEventListener("focusin", onOver)
      root.removeEventListener("focusout", onOut)
    }
  }, [selector])

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  )
}
