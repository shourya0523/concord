"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  Beaker,
  Bookmark,
  BookOpen,
  Building2,
  Calculator,
  ChartNoAxesColumn,
  Flame,
  Home,
  Layers,
  Library,
  Map,
  Mic,
  Settings,
  Sun,
} from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"
import { AuthAccountMenu } from "@/components/auth-account-menu"
import { ConcordLogo } from "@/components/concord-logo"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"

/**
 * Five groups (plan 2026-09-23-001 P4.5): Today / Practice / Learn / Firms /
 * Progress. Every older route stays reachable; Settings lives in the account
 * area at the foot of the sidebar.
 */
const NAV: Array<{
  label: string
  items: Array<{ href: string; label: string; icon: LucideIcon }>
}> = [
  {
    label: "Today",
    items: [
      { href: "/today", label: "Today", icon: Sun },
      { href: "/dashboard", label: "Overview", icon: Home },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/study", label: "Study", icon: BookOpen },
      { href: "/simulator", label: "Simulator", icon: Mic },
      { href: "/drills", label: "Drills", icon: Calculator },
      { href: "/saved", label: "Saved", icon: Bookmark },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/learn", label: "Modules", icon: Library },
      { href: "/concepts", label: "Concept labs", icon: Beaker },
    ],
  },
  {
    label: "Firms",
    items: [
      { href: "/companies", label: "Company rooms", icon: Building2 },
      { href: "/prep/heat", label: "Topic heat", icon: Flame },
      { href: "/prep/rag", label: "Session pack", icon: Layers },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
      { href: "/plan", label: "Roadmap", icon: Map },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === "/dashboard" || href === "/today") return false
  return pathname.startsWith(`${href}/`)
}

/**
 * Full-bleed cream shell: light sidebar + paper canvas, ink nav with
 * Lucide icons and Concorde mark. One document page — pages own the only H1.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-svh bg-paper text-ink">
      <MockupSvgFilters />
      <aside className="hidden w-[224px] shrink-0 flex-col border-r border-chrome-border bg-chrome px-2 py-3 text-chrome-text md:flex">
        <Link
          href="/today"
          className="mb-5 rounded px-2 py-1.5 transition-colors hover:bg-chrome-hover"
          aria-label="Concord home"
        >
          <ConcordLogo size="sm" priority />
        </Link>
        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {NAV.map((section) => (
            <section key={section.label}>
              <p className="px-2 pb-1 text-[11px] font-medium text-chrome-muted">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href)
                  const Icon = item.icon
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-chrome-hover font-medium text-chrome-text"
                            : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-text",
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
        <div className="mt-auto space-y-1 px-2 pt-4">
          <AuthAccountMenu />
          <Link
            href="/settings"
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 text-[11px] transition-colors hover:text-chrome-text",
              isActive(pathname, "/settings") ? "text-chrome-text" : "text-chrome-muted",
            )}
          >
            <Settings className="size-3" aria-hidden />
            Settings
          </Link>
          <p className="text-[10px] text-chrome-muted">Ink · cream · pastel data</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <nav
          aria-label="Mobile workspace"
          className="flex gap-1 overflow-x-auto border-b border-chrome-border bg-chrome px-3 py-2 md:hidden"
        >
          {NAV.flatMap((section) =>
            section.items.map((item) => {
              const Icon = item.icon
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs",
                    active
                      ? "bg-chrome-hover font-medium text-chrome-text"
                      : "text-chrome-muted",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              )
            }),
          )}
          <Link
            href="/settings"
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs",
              isActive(pathname, "/settings")
                ? "bg-chrome-hover font-medium text-chrome-text"
                : "text-chrome-muted",
            )}
          >
            <Settings className="size-3.5 shrink-0" aria-hidden />
            Settings
          </Link>
        </nav>
        <main className="mx-auto w-full max-w-[1480px] px-4 py-8 text-ink md:px-6 md:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
