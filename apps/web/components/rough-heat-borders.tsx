"use client"

import * as React from "react"
import rough from "roughjs"

import { prefersReducedMotion, seedFrom } from "@/lib/mockups/motion"

const REVEAL_MS = 420
const STAGGER_MS = 80

/**
 * Draws memoized rough.js rectangles around each heatmap cell button
 * (DESIGN.md §10.4 / §11 — rough cell borders; hover stays lime InkHoverScope).
 *
 * Coordinates are relative to this host (the visible heatmap viewport). Cells
 * outside the scrollport are skipped, the host clips overflow, and we redraw
 * on resize + horizontal scroll so strokes stay locked to their cells.
 *
 * When the heatmap fades columns L→R, border drawing is deferred until the
 * sweep finishes so getBoundingClientRect matches settled layout.
 */
export function RoughHeatBorders({
  seedKey,
  deps,
  children,
  className,
}: {
  seedKey: string
  /** Re-draw when heat membership changes. */
  deps: unknown
  children: React.ReactNode
  className?: string
}) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<SVGSVGElement>(null)

  React.useEffect(() => {
    const host = hostRef.current
    const overlay = overlayRef.current
    if (!host || !overlay) return

    const scrollRoot = host.querySelector<HTMLElement>('[data-slot="topic-heatmap"]')

    const draw = () => {
      const hostBox = host.getBoundingClientRect()
      const width = host.offsetWidth
      const height = host.offsetHeight
      if (width < 8 || height < 8) return
      overlay.setAttribute("width", String(width))
      overlay.setAttribute("height", String(height))
      overlay.setAttribute("viewBox", `0 0 ${width} ${height}`)
      while (overlay.firstChild) overlay.removeChild(overlay.firstChild)

      const heatmap = host.querySelector<HTMLElement>('[data-slot="topic-heatmap"]')
      const firmCount = Number(heatmap?.dataset.firmCount || 0)
      const animateReveal = heatmap?.dataset.reveal != null
      const reduce = prefersReducedMotion()

      const rc = rough.svg(overlay)
      const buttons = host.querySelectorAll<HTMLElement>(
        '[data-slot="topic-heatmap"] tbody button',
      )
      buttons.forEach((btn, index) => {
        const box = btn.getBoundingClientRect()
        // Skip cells fully outside the visible host (scrolled away).
        if (
          box.right < hostBox.left ||
          box.left > hostBox.right ||
          box.bottom < hostBox.top ||
          box.top > hostBox.bottom
        ) {
          return
        }
        const x = box.left - hostBox.left
        const y = box.top - hostBox.top
        const w = box.width
        const h = box.height
        if (w < 4 || h < 4) return
        const node = rc.rectangle(x + 0.5, y + 0.5, w - 1, h - 1, {
          seed: seedFrom(`${seedKey}-cell-${index}`),
          roughness: 1.1,
          bowing: 0.7,
          stroke: "var(--ink)",
          strokeWidth: 1.05,
          fill: "transparent",
        }) as SVGElement
        if (animateReveal && !reduce && firmCount > 0) {
          const firmIndex = index % firmCount
          // Opacity-only — keep stroke geometry on the settled cell box.
          node.style.opacity = "0"
          node.style.animation = `heat-reveal-ltr ${REVEAL_MS}ms var(--ease-calm) ${(firmIndex + 1) * STAGGER_MS}ms both`
        }
        overlay.appendChild(node)
      })
    }

    const scheduleDraw = () => {
      window.requestAnimationFrame(draw)
    }

    // Clear stale strokes immediately, then draw on the next frame so table
    // layout (and any remount reveal) has settled before we measure.
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild)
    const boot = window.setTimeout(scheduleDraw, reduceMotionBootDelay(host))

    const ro = new ResizeObserver(scheduleDraw)
    ro.observe(host)
    if (scrollRoot) {
      ro.observe(scrollRoot)
      scrollRoot.addEventListener("scroll", scheduleDraw, { passive: true })
    }
    window.addEventListener("resize", scheduleDraw)
    return () => {
      window.clearTimeout(boot)
      ro.disconnect()
      scrollRoot?.removeEventListener("scroll", scheduleDraw)
      window.removeEventListener("resize", scheduleDraw)
    }
  }, [deps, seedKey])

  return (
    <div
      ref={hostRef}
      className={className ? `relative overflow-hidden ${className}` : "relative overflow-hidden"}
    >
      {children}
      <svg
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
        aria-hidden
      />
    </div>
  )
}

function reduceMotionBootDelay(host: HTMLElement): number {
  if (prefersReducedMotion()) return 0
  const heatmap = host.querySelector<HTMLElement>('[data-slot="topic-heatmap"]')
  if (heatmap?.dataset.reveal == null) return 0
  // One frame is enough once transforms are gone; tiny delay lets paint settle.
  return 32
}
