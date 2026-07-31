"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { MockupThemeLock } from "@/components/mockups/mockup-theme-lock"

/**
 * Notion-like resting surface (DESIGN.md §2):
 * monochrome chrome, gray sidebar, white page, content-first.
 * Accent color only on primary actions / heat data — not on layout.
 */
export const MOCKUP_LIGHT_VARS = {
  "--paper": "oklch(0.985 0.002 80)",
  "--ink": "oklch(0.2 0.01 55)",
  "--graphite": "oklch(0.45 0.01 55)",
  "--stone": "oklch(0.94 0.004 80)",
  "--lime": "oklch(0.86 0.18 128)",
  "--lime-foreground": "oklch(0.2 0.04 130)",
  "--background": "oklch(0.97 0.003 80)",
  "--foreground": "oklch(0.2 0.01 55)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.2 0.01 55)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.2 0.01 55)",
  "--primary": "oklch(0.22 0.01 55)",
  "--primary-foreground": "oklch(0.99 0.001 80)",
  "--secondary": "oklch(0.94 0.004 80)",
  "--secondary-foreground": "oklch(0.2 0.01 55)",
  "--muted": "oklch(0.95 0.003 80)",
  "--muted-foreground": "oklch(0.45 0.01 55)",
  "--accent": "oklch(0.94 0.004 80)",
  "--accent-foreground": "oklch(0.2 0.01 55)",
  "--border": "oklch(0.9 0.005 80)",
  "--input": "oklch(0.9 0.005 80)",
  "--ring": "oklch(0.22 0.01 55)",
  color: "oklch(0.2 0.01 55)",
  background: "oklch(0.97 0.003 80)",
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
    <div className="mockup-surface flex min-h-screen font-sans" style={MOCKUP_LIGHT_VARS}>
      <MockupThemeLock />
      <MockupSvgFilters />

      {/* Sidebar — workspace nav */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-[oklch(0.965_0.003_80)] px-2 py-3 md:flex">
        <Link
          href="/mockups"
          className="mb-3 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-black/5"
        >
          Concord
        </Link>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Workspace">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.pages.map((page) => {
                  const className = cn(
                    "block w-full rounded-md px-2 py-1 text-left text-sm",
                    page.active
                      ? "bg-black/8 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
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
        <p className="mt-auto px-2 pt-4 text-[10px] text-muted-foreground/80">Phase 1 mockup</p>
      </aside>

      {/* Page canvas */}
      <div className="flex min-w-0 flex-1 flex-col bg-card">
        {/* Mobile top nav */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {sections.flatMap((s) =>
            s.pages.map((page) =>
              page.href ? (
                <Link
                  key={page.id}
                  href={page.href}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs",
                    page.active ? "bg-black/8 font-medium" : "text-muted-foreground",
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
                    page.active ? "bg-black/8 font-medium" : "text-muted-foreground",
                  )}
                >
                  {page.label}
                </button>
              ),
            ),
          )}
        </div>

        <main className="mx-auto w-full max-w-[720px] flex-1 px-6 py-10 md:px-12 md:py-14">
          {breadcrumb ? (
            <p className="mb-2 text-xs text-muted-foreground">{breadcrumb}</p>
          ) : null}
          <h1 className="font-sans text-[32px] font-semibold leading-tight tracking-tight text-foreground md:text-[40px]">
            {pageTitle}
          </h1>
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

/** Notion-style callout with Warren. */
export function NotionCallout({
  children,
  warren,
}: {
  children: ReactNode
  warren?: ReactNode
}) {
  return (
    <div className="flex gap-3 rounded-md bg-[oklch(0.97_0.003_80)] px-3 py-3 text-sm leading-relaxed text-foreground">
      {warren ? <div className="shrink-0 pt-0.5">{warren}</div> : null}
      <div className="min-w-0 pt-1">{children}</div>
    </div>
  )
}
