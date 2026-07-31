"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { MockupThemeLock } from "@/components/mockups/mockup-theme-lock"

/**
 * Settled palette: BLACK · GREY · cream · pastel accents.
 * Chrome is true neutral black/grey (chroma 0) — never warm brown charcoal.
 */
export const MOCKUP_LIGHT_VARS = {
  "--paper": "#f7f1e4",
  "--ink": "#111111",
  "--graphite": "#555555",
  "--stone": "#d4cec0",
  "--chrome": "#111111",
  "--chrome-hover": "#2a2a2a",
  "--chrome-border": "#333333",
  "--chrome-text": "#e8e8e8",
  "--chrome-muted": "#888888",
  "--success": "#8fbc8f",
  "--error": "#e8b4b8",
  "--streak": "#f0d78c",
  "--milestone": "#c4b5e0",
  "--lime": "#b8e046",
  "--lime-foreground": "#1a1a1a",
  "--background": "#1a1a1a",
  "--foreground": "#111111",
  "--card": "#f7f1e4",
  "--card-foreground": "#111111",
  "--popover": "#f7f1e4",
  "--popover-foreground": "#111111",
  "--primary": "#111111",
  "--primary-foreground": "#f7f1e4",
  "--secondary": "#ebe4d4",
  "--secondary-foreground": "#111111",
  "--muted": "#ebe4d4",
  "--muted-foreground": "#555555",
  "--accent": "#ebe4d4",
  "--accent-foreground": "#111111",
  "--border": "#cfc7b6",
  "--input": "#cfc7b6",
  "--ring": "#111111",
  "--sidebar": "#000000",
  "--sidebar-foreground": "#e8e8e8",
  "--sidebar-primary": "#f7f1e4",
  "--sidebar-primary-foreground": "#000000",
  "--sidebar-accent": "#2a2a2a",
  "--sidebar-accent-foreground": "#e8e8e8",
  "--sidebar-border": "#333333",
  color: "#111111",
  background: "#1a1a1a",
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
      data-mockup-theme="black-grey-cream"
    >
      <MockupThemeLock />
      <MockupSvgFilters />

      {/* Sidebar — true black */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[#333] bg-black px-2 py-3 text-[#e8e8e8] md:flex">
        <Link
          href="/mockups"
          className="mb-3 rounded-md px-2 py-1.5 text-sm font-medium text-[#e8e8e8] hover:bg-[#2a2a2a]"
        >
          Concord
        </Link>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Workspace">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[11px] font-medium text-[#777]">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.pages.map((page) => {
                  const className = cn(
                    "block w-full rounded-md px-2 py-1 text-left text-sm",
                    page.active
                      ? "bg-[#2a2a2a] font-medium text-white"
                      : "text-[#aaa] hover:bg-[#1a1a1a] hover:text-[#e8e8e8]",
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
        <p className="mt-auto px-2 pt-4 text-[10px] text-[#666]">Black · grey · cream</p>
      </aside>

      {/* Workspace — neutral grey; cream document on top */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#1a1a1a]">
        <div className="flex gap-1 overflow-x-auto border-b border-[#333] bg-black px-3 py-2 md:hidden">
          {sections.flatMap((s) =>
            s.pages.map((page) =>
              page.href ? (
                <Link
                  key={page.id}
                  href={page.href}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs",
                    page.active
                      ? "bg-[#2a2a2a] font-medium text-white"
                      : "text-[#aaa]",
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
                      ? "bg-[#2a2a2a] font-medium text-white"
                      : "text-[#aaa]",
                  )}
                >
                  {page.label}
                </button>
              ),
            ),
          )}
        </div>

        <main className="mx-auto w-full max-w-[720px] flex-1 px-6 py-10 md:px-12 md:py-14">
          <article className="rounded-sm border border-black/20 bg-[#f7f1e4] px-6 py-8 shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] md:px-10 md:py-10">
            {breadcrumb ? (
              <p className="mb-2 text-xs text-[#555]">{breadcrumb}</p>
            ) : null}
            <h1 className="font-sans text-[32px] font-semibold leading-tight tracking-tight text-[#111] md:text-[40px]">
              {pageTitle}
            </h1>
            <div className="mt-8 text-[#111]">{children}</div>
          </article>
        </main>
      </div>
    </div>
  )
}

/** Cream callout — grey wash, black border. */
export function NotionCallout({
  children,
  warren,
}: {
  children: ReactNode
  warren?: ReactNode
}) {
  return (
    <div className="flex gap-3 rounded-sm border border-black/15 bg-[#ebe4d4] px-3 py-3 text-sm leading-relaxed text-[#111]">
      {warren ? <div className="shrink-0 pt-0.5">{warren}</div> : null}
      <div className="min-w-0 pt-1">{children}</div>
    </div>
  )
}
