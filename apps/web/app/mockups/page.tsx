import Link from "next/link"

import { MockupSvgFilters } from "@/components/mockups/svg-filters"

export const metadata = {
  title: "Phase 1 journey mockups",
  description: "Full-journey Concord mockups — Mode A, Learn, Plan→Simulator",
}

const JOURNEYS = [
  {
    href: "/mockups/mode-a",
    title: "Mode A · Company → RAG → Study",
    body: "Topic heat dual-encoding → pseudo-RAG citations → layered reveal with Warren focus-pause.",
  },
  {
    href: "/mockups/mode-b",
    title: "Mode B · Learn module → Lab",
    body: "Module catalog → roadmap checkpoints → DiagramCanvas lab → quiz → Apply at Firm.",
  },
  {
    href: "/mockups/plan-sim",
    title: "Plan → Simulator → Score",
    body: "Interview-date roadmap → DiceBear interviewer → torn-paper hero score + handwriting.",
  },
] as const

export default function MockupsIndexPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MockupSvgFilters />
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Phase 1 · full-journey mockups
        </p>
        <h1 className="font-display mt-2 text-5xl tracking-tight md:text-6xl">Concord journeys</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Connected flows with hard visual parts in context — not isolated component demos. Approve
          before Phase 2 product integration.
        </p>
        <ul className="mt-10 space-y-4">
          {JOURNEYS.map((j) => (
            <li key={j.href}>
              <Link
                href={j.href}
                className="block rounded-[var(--radius-study)] border border-border bg-card px-5 py-5 transition-transform duration-[280ms] ease-[var(--ease-settle)] hover:-translate-y-0.5"
              >
                <h2 className="font-display text-2xl tracking-tight">{j.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{j.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
