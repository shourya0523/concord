"use client"

import * as React from "react"
import rough from "roughjs"

import { seedFrom } from "@/lib/mockups/motion"

/**
 * Draws memoized rough.js rectangles around each heatmap cell button
 * (DESIGN.md §10.4 / §11 — rough cell borders; hover stays lime InkHoverScope).
 *
 * Coordinates are relative to this host (the visible heatmap viewport). Cells
 * outside the scrollport are skipped, the host clips overflow, and we redraw
 * on resize + horizontal scroll so strokes stay locked to their cells.
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

      const rc = rough.svg(overlay)
      const buttons = host.querySelectorAll<HTMLElement>(
        '[data-slot="topic-heatmap"] button',
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
        })
        overlay.appendChild(node)
      })
    }

    const scheduleDraw = () => {
      window.requestAnimationFrame(draw)
    }

    draw()
    const ro = new ResizeObserver(scheduleDraw)
    ro.observe(host)
    if (scrollRoot) {
      ro.observe(scrollRoot)
      scrollRoot.addEventListener("scroll", scheduleDraw, { passive: true })
    }
    window.addEventListener("resize", scheduleDraw)
    return () => {
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
