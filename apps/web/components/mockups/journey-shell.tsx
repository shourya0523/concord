import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"

const JOURNEYS = [
  { href: "/mockups/mode-a", label: "A · Company → RAG → Study" },
  { href: "/mockups/mode-b", label: "B · Learn module → Lab" },
  { href: "/mockups/plan-sim", label: "C · Plan → Simulator" },
] as const

export function JourneyShell({
  title,
  eyebrow,
  activeHref,
  children,
  techniques,
}: {
  title: string
  eyebrow: string
  activeHref: string
  children: ReactNode
  techniques: Array<{ part: string; technique: string }>
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MockupSvgFilters />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Phase 1 mockup · {eyebrow}
              </p>
              <h1 className="font-display mt-1 text-3xl tracking-tight md:text-5xl">{title}</h1>
            </div>
            <Link
              href="/mockups"
              className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase underline-offset-4 hover:underline"
            >
              All journeys
            </Link>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Mockup journeys">
            {JOURNEYS.map((j) => (
              <Link
                key={j.href}
                href={j.href}
                className={cn(
                  "rounded-[var(--radius-control)] border px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase",
                  activeHref === j.href
                    ? "border-lime/50 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-lime/30",
                )}
              >
                {j.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 md:px-6">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Hard parts in this journey
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {techniques.map((t) => (
              <li key={t.part} className="border-b border-border/70 pb-2">
                <p className="font-medium text-foreground">{t.part}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.technique}</p>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  )
}
