"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { MockupThemeLock } from "@/components/mockups/mockup-theme-lock"

/**
 * Settled palette (DESIGN.md §3): black/charcoal chrome · cream paper · black ink · pastel data.
 * Dark sidebar vs cream document — no light-on-light.
 */
export const MOCKUP_LIGHT_VARS = {
  "--paper": "oklch(0.96 0.018 88)",
  "--ink": "oklch(0.18 0.012 55)",
  "--graphite": "oklch(0.42 0.012 55)",
  "--stone": "oklch(0.86 0.014 85)",
  "--chrome": "oklch(0.18 0.01 55)",
  "--chrome-hover": "oklch(0.26 0.01 55)",
  "--chrome-border": "oklch(0.28 0.01 55)",
  "--chrome-text": "oklch(0.92 0.01 88)",
  "--chrome-muted": "oklch(0.62 0.01 70)",
  "--success": "oklch(0.82 0.08 145)",
  "--error": "oklch(0.78 0.12 25)",
  "--streak": "oklch(0.84 0.11 75)",
  "--milestone": "oklch(0.80 0.10 290)",
  "--lime": "oklch(0.82 0.08 145)",
  "--lime-foreground": "oklch(0.25 0.04 148)",
  "--background": "oklch(0.22 0.01 55)",
  "--foreground": "oklch(0.18 0.012 55)",
  "--card": "oklch(0.975 0.014 88)",
  "--card-foreground": "oklch(0.18 0.012 55)",
  "--popover": "oklch(0.975 0.014 88)",
  "--popover-foreground": "oklch(0.18 0.012 55)",
  "--primary": "oklch(0.18 0.012 55)",
  "--primary-foreground": "oklch(0.975 0.014 88)",
  "--secondary": "oklch(0.92 0.016 88)",
  "--secondary-foreground": "oklch(0.18 0.012 55)",
  "--muted": "oklch(0.92 0.016 88)",
  "--muted-foreground": "oklch(0.42 0.012 55)",
  "--accent": "oklch(0.92 0.016 88)",
  "--accent-foreground": "oklch(0.18 0.012 55)",
  "--border": "oklch(0.86 0.014 85)",
  "--input": "oklch(0.86 0.014 85)",
  "--ring": "oklch(0.18 0.012 55)",
  "--sidebar": "oklch(0.16 0.01 55)",
  "--sidebar-foreground": "oklch(0.92 0.01 88)",
  "--sidebar-primary": "oklch(0.975 0.014 88)",
  "--sidebar-primary-foreground": "oklch(0.16 0.01 55)",
  "--sidebar-accent": "oklch(0.26 0.01 55)",
  "--sidebar-accent-foreground": "oklch(0.92 0.01 88)",
  "--sidebar-border": "oklch(0.28 0.01 55)",
  color: "oklch(0.18 0.012 55)",
  background: "oklch(0.22 0.01 55)",
} as CSSProperties

export type SidebarPage = {
  id: string
  label: string
  active?: boolean
  onSelect?: () => void
  href?: string
}

export type SidebarSection = {
  title: string
  pages: SidebarPage[]
}

export function JourneyShell({
  pageTitle,
  breadcrumb,
  sections,
  children,
}: {
  /** Document title — the only H1 on the page (Notion pattern). */
  pageTitle: string
  breadcrumb?: string
  sections: SidebarSection[]
  children: ReactNode
}) {
  return (
    <div
      className="mockup-surface flex min-h-screen font-sans"
      style={MOCKUP_LIGHT_VARS}
      data-mockup-theme="ink-cream"
    >
      <MockupThemeLock />
      <MockupSvgFilters />

      {/* Sidebar — near-black chrome */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[oklch(0.28_0.01_55)] bg-[oklch(0.16_0.01_55)] px-2 py-3 text-[oklch(0.92_0.01_88)] md:flex">
        <Link
          href="/mockups"
          className="mb-3 rounded-md px-2 py-1.5 text-sm font-medium text-[oklch(0.92_0.01_88)] hover:bg-[oklch(0.26_0.01_55)]"
        >
          Concord
        </Link>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Workspace">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[11px] font-medium text-[oklch(0.55_0.01_70)]">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.pages.map((page) => {
                  const className = cn(
                    "block w-full rounded-md px-2 py-1 text-left text-sm",
                    page.active
                      ? "bg-[oklch(0.26_0.01_55)] font-medium text-[oklch(0.975_0.014_88)]"
                      : "text-[oklch(0.68_0.01_70)] hover:bg-[oklch(0.22_0.01_55)] hover:text-[oklch(0.92_0.01_88)]",
                  )
                  if (page.href) {
                    return (
                      <li key={page.id}>
                        <Link href={page.href} className={className}>
                          {page.label}
                        </Link>
                      </li>
                    )
                  }
                  return (
                    <li key={page.id}>
                      <button type="button" onClick={page.onSelect} className={className}>
                        {page.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <p className="mt-auto px-2 pt-4 text-[10px] text-[oklch(0.5_0.01_70)]">
          Black · grey · cream
        </p>
      </aside>

      {/* Workspace chrome (dark grey) + cream document */}
      <div className="flex min-w-0 flex-1 flex-col bg-[oklch(0.22_0.01_55)]">
        {/* Mobile top nav — dark chrome */}
        <div className="flex gap-1 overflow-x-auto border-b border-[oklch(0.28_0.01_55)] bg-[oklch(0.16_0.01_55)] px-3 py-2 md:hidden">
          {sections.flatMap((s) =>
            s.pages.map((page) =>
              page.href ? (
                <Link
                  key={page.id}
                  href={page.href}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs",
                    page.active
                      ? "bg-[oklch(0.26_0.01_55)] font-medium text-[oklch(0.975_0.014_88)]"
                      : "text-[oklch(0.68_0.01_70)]",
                  )}
                >
                  {page.label}
                </Link>
              ) : (
                <button
                  key={page.id}
                  type="button"
                  onClick={page.onSelect}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs",
                    page.active
                      ? "bg-[oklch(0.26_0.01_55)] font-medium text-[oklch(0.975_0.014_88)]"
                      : "text-[oklch(0.68_0.01_70)]",
                  )}
                >
                  {page.label}
                </button>
              ),
            ),
          )}
        </div>

        <main className="mx-auto w-full max-w-[720px] flex-1 px-6 py-10 md:px-12 md:py-14">
          <article className="rounded-sm border border-[oklch(0.18_0.012_55_/0.2)] bg-[oklch(0.975_0.014_88)] px-6 py-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.25)] md:px-10 md:py-10">
            {breadcrumb ? (
              <p className="mb-2 text-xs text-muted-foreground">{breadcrumb}</p>
            ) : null}
            <h1 className="font-sans text-[32px] font-semibold leading-tight tracking-tight text-foreground md:text-[40px]">
              {pageTitle}
            </h1>
            <div className="mt-8">{children}</div>
          </article>
        </main>
      </div>
    </div>
  )
}

/** Cream callout — soft wash on cream page, ink border. */
export function NotionCallout({
  children,
  warren,
}: {
  children: ReactNode
  warren?: ReactNode
}) {
  return (
    <div className="flex gap-3 rounded-sm border border-[oklch(0.18_0.012_55_/0.18)] bg-[oklch(0.94_0.016_88)] px-3 py-3 text-sm leading-relaxed text-foreground">
      {warren ? <div className="shrink-0 pt-0.5">{warren}</div> : null}
      <div className="min-w-0 pt-1">{children}</div>
    </div>
  )
}
