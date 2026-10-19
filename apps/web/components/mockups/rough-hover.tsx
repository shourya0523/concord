"use client"

import * as React from "react"
import rough from "roughjs"

import { cn } from "@ibpe/ui/lib/utils"
import { prefersReducedMotion, resolveCssColor, seedFrom } from "@/lib/mockups/motion"

/**
 * Lime hover box (DESIGN.md §7/§8) drawn in one fixed, body-level overlay.
 *
 * rough-notation inserts its SVG beside the target, so any `overflow-hidden`,
 * `truncate` or scroll-clipped ancestor (heatmap viewport, truncated links)
 * cut the box off. A single overlay is never clipped and never shifts layout.
 */
type HoverOptions = { padding: number; strokeWidth: number; duration: number }

let overlay: SVGSVGElement | null = null
let activeTarget: HTMLElement | null = null
let activeOptions: HoverOptions | null = null

function getOverlay(): SVGSVGElement {
  if (overlay && overlay.isConnected) return overlay
  overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  overlay.setAttribute("aria-hidden", "true")
  overlay.dataset.roughHoverOverlay = ""
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    overflow: "visible",
    zIndex: "60",
  })
  document.body.appendChild(overlay)
  return overlay
}

function draw(target: HTMLElement, options: HoverOptions, animate: boolean) {
  const svg = getOverlay()
  while (svg.firstChild) svg.removeChild(svg.firstChild)
  const box = target.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return
  const { padding } = options
  const node = rough.svg(svg).rectangle(
    box.left - padding,
    box.top - padding,
    box.width + padding * 2,
    box.height + padding * 2,
    {
      // Stable per-target linework — no wobble between hovers.
      seed: seedFrom(target.textContent?.slice(0, 64) || target.tagName),
      roughness: 1.3,
      bowing: 1,
      stroke: resolveCssColor(target, "var(--lime)"),
      strokeWidth: options.strokeWidth,
      disableMultiStroke: true,
    },
  )
  svg.appendChild(node)
  if (!animate) return
  node.querySelectorAll("path").forEach((path) => {
    const length = path.getTotalLength()
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = `${length}`
    path.style.transition = `stroke-dashoffset ${options.duration}ms ease-out`
    path.getBoundingClientRect()
    path.style.strokeDashoffset = "0"
  })
}

function follow() {
  if (activeTarget && activeOptions) {
    if (!activeTarget.isConnected) return hideHoverBox()
    draw(activeTarget, activeOptions, false)
  }
}

export function showHoverBox(target: HTMLElement, options: HoverOptions) {
  if (activeTarget === target) return
  const first = activeTarget === null
  activeTarget = target
  activeOptions = options
  draw(target, options, !prefersReducedMotion())
  if (first) {
    window.addEventListener("scroll", follow, { capture: true, passive: true })
    window.addEventListener("resize", follow, { passive: true })
  }
}

export function hideHoverBox(target?: HTMLElement) {
  if (target && target !== activeTarget) return
  activeTarget = null
  activeOptions = null
  window.removeEventListener("scroll", follow, { capture: true })
  window.removeEventListener("resize", follow)
  if (overlay) while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
}

/**
 * Hand-drawn lime box on hover/focus — preferred over glow/ring (DESIGN.md).
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

  const show = React.useCallback(() => {
    if (ref.current) showHoverBox(ref.current, { padding, strokeWidth: 1.5, duration: 280 })
  }, [padding])
  const clear = React.useCallback(() => {
    if (ref.current) hideHoverBox(ref.current)
  }, [])

  React.useEffect(() => clear, [clear])

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
 * Event delegation: lime rough box around hovered controls in a scope
 * (heatmap cells, button rows).
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

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let active: HTMLElement | null = null

    const onOver = (e: Event) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const el = t.closest<HTMLElement>(selector)
      if (!el || !root.contains(el) || el === active) return
      active = el
      showHoverBox(el, { padding: 2, strokeWidth: 1.4, duration: 220 })
    }

    const onOut = (e: Event) => {
      if (!active) return
      const related = (e as MouseEvent | FocusEvent).relatedTarget
      if (related instanceof Node && active.contains(related)) return
      hideHoverBox(active)
      active = null
    }

    root.addEventListener("mouseover", onOver)
    root.addEventListener("mouseout", onOut)
    root.addEventListener("focusin", onOver)
    root.addEventListener("focusout", onOut)
    return () => {
      if (active) hideHoverBox(active)
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
