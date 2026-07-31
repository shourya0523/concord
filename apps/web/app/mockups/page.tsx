"use client"

import Link from "next/link"
import type { CSSProperties } from "react"

import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { MockupThemeLock } from "@/components/mockups/mockup-theme-lock"

const JOURNEYS = [
  {
    href: "/mockups/mode-a",
    title: "Company → RAG → Study",
    body: "Topic heat → grounded pack → layered reveal with Warren.",
  },
  {
    href: "/mockups/mode-b",
    title: "Learn → Lab → Firm",
    body: "Module catalog → diagram lab → quiz → Apply at Firm.",
  },
  {
    href: "/mockups/plan-sim",
    title: "Plan → Simulator → Score",
    body: "Roadmap → interviewer mock → score reveal.",
  },
] as const

export default function MockupsIndexPage() {
  return (
    <div
      className="min-h-screen text-foreground"
      style={
        {
          "--paper": "oklch(0.985 0.004 85)",
          "--background": "oklch(0.985 0.004 85)",
          background:
            "radial-gradient(120% 80% at 100% 0%, oklch(0.97 0.01 85), transparent 55%), var(--paper)",
        } as CSSProperties
      }
    >
      <MockupThemeLock />
      <MockupSvgFilters />
      <main className="mx-auto max-w-3xl px-4 py-14 md:px-6">
        <p className="font-sans text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          Concord · Phase 1
        </p>
        <h1 className="font-display mt-2 text-5xl tracking-tight">Journeys</h1>
        <p className="mt-4 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
          Full flows with hard visual parts in context. Approve before Phase 2.
        </p>
        <ul className="mt-12 space-y-3">
          {JOURNEYS.map((j) => (
            <li key={j.href}>
              <Link
                href={j.href}
                className="block border-b border-border py-5 transition-colors hover:border-foreground"
              >
                <h2 className="font-display text-2xl tracking-tight">{j.title}</h2>
                <p className="mt-1 font-sans text-sm text-muted-foreground">{j.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
