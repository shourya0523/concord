"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { MockupThemeLock } from "@/components/mockups/mockup-theme-lock"

const JOURNEYS = [
  { href: "/mockups/mode-a", label: "Company" },
  { href: "/mockups/mode-b", label: "Learn" },
  { href: "/mockups/plan-sim", label: "Plan · Sim" },
] as const

/** Full light token set — wins even if html still has .dark from system theme. */
export const MOCKUP_LIGHT_VARS = {
  "--paper": "oklch(0.985 0.004 85)",
  "--ink": "oklch(0.18 0.014 55)",
  "--graphite": "oklch(0.42 0.016 60)",
  "--stone": "oklch(0.91 0.01 85)",
  "--lime": "oklch(0.86 0.18 128)",
  "--lime-foreground": "oklch(0.2 0.04 130)",
  "--background": "oklch(0.985 0.004 85)",
  "--foreground": "oklch(0.18 0.014 55)",
  "--card": "oklch(0.995 0.002 85)",
  "--card-foreground": "oklch(0.18 0.014 55)",
  "--popover": "oklch(0.995 0.002 85)",
  "--popover-foreground": "oklch(0.18 0.014 55)",
  "--primary": "oklch(0.22 0.02 55)",
  "--primary-foreground": "oklch(0.98 0.004 85)",
  "--secondary": "oklch(0.94 0.008 85)",
  "--secondary-foreground": "oklch(0.18 0.014 55)",
  "--muted": "oklch(0.955 0.006 85)",
  "--muted-foreground": "oklch(0.40 0.02 60)",
  "--accent": "oklch(0.94 0.01 85)",
  "--accent-foreground": "oklch(0.18 0.014 55)",
  "--border": "oklch(0.86 0.008 80)",
  "--input": "oklch(0.86 0.008 80)",
  "--ring": "oklch(0.22 0.02 55)",
  color: "oklch(0.18 0.014 55)",
  background:
    "radial-gradient(120% 80% at 100% 0%, oklch(0.97 0.006 85), transparent 55%), oklch(0.985 0.004 85)",
} as CSSProperties

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
    <div className="mockup-surface min-h-screen" style={MOCKUP_LIGHT_VARS}>
      <MockupThemeLock />
      <MockupSvgFilters />
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-3xl items-end justify-between gap-4 px-4 py-6 md:px-6">
          <div className="min-w-0">
            <p className="font-sans text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Concord · {eyebrow}
            </p>
            <h1 className="font-display mt-1 text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
              {title}
            </h1>
          </div>
          <nav className="flex shrink-0 flex-wrap justify-end gap-1" aria-label="Mockup journeys">
            {JOURNEYS.map((j) => (
              <Link
                key={j.href}
                href={j.href}
                className={cn(
                  "rounded-md px-2.5 py-1 font-sans text-xs",
                  activeHref === j.href
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {j.label}
              </Link>
            ))}
            <Link
              href="/mockups"
              className="rounded-md px-2.5 py-1 font-sans text-xs text-muted-foreground hover:text-foreground"
            >
              All
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 text-foreground md:px-6">{children}</main>

      <footer className="mx-auto max-w-3xl px-4 pb-12 md:px-6">
        <details className="group border-t border-border/80 pt-6">
          <summary className="cursor-pointer font-sans text-xs tracking-wide text-muted-foreground uppercase select-none">
            Hard parts · techniques
          </summary>
          <ul className="mt-4 space-y-3">
            {techniques.map((t) => (
              <li key={t.part}>
                <p className="font-sans text-sm font-medium text-foreground">{t.part}</p>
                <p className="mt-0.5 font-sans text-sm text-muted-foreground">{t.technique}</p>
              </li>
            ))}
          </ul>
        </details>
      </footer>
    </div>
  )
}
