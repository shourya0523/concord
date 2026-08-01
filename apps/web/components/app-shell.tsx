"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@ibpe/ui/lib/utils"
import { AuthAccountMenu } from "@/components/auth-account-menu"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"

const NAV = [
  {
    label: "Company",
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/companies", label: "Company rooms" },
      { href: "/prep/heat", label: "Topic heat" },
      { href: "/prep/rag", label: "Session pack" },
      { href: "/study", label: "Study" },
      { href: "/saved", label: "Saved" },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/learn", label: "Modules" },
      { href: "/concepts", label: "Concept labs" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/plan", label: "Roadmap" },
      { href: "/simulator", label: "Simulator" },
      { href: "/progress", label: "Progress" },
      { href: "/settings", label: "Settings" },
    ],
  },
] as const

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === "/dashboard") return false
  return pathname.startsWith(`${href}/`)
}

/**
 * Notion base: true-black workspace sidebar + cream document on dark grey
 * chrome. One document page — pages own the only H1.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-svh bg-chrome-workspace text-foreground">
      <MockupSvgFilters />
      <aside className="hidden w-[224px] shrink-0 flex-col border-r border-chrome-border bg-chrome px-2 py-3 text-chrome-text md:flex">
        <Link
          href="/dashboard"
          className="mb-5 rounded px-2 py-1.5 text-sm font-semibold hover:bg-chrome-hover"
        >
          Concord
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
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block rounded px-2 py-1 text-sm transition-colors",
                          active
                            ? "bg-chrome-hover font-medium text-chrome-text"
                            : "text-chrome-muted hover:bg-chrome-workspace hover:text-chrome-text",
                        )}
                      >
                        {item.label}
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
          <p className="text-[10px] text-chrome-muted">Black · grey · cream · pastel data</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <nav
          aria-label="Mobile workspace"
          className="flex gap-1 overflow-x-auto border-b border-chrome-border bg-chrome px-3 py-2 md:hidden"
        >
          {NAV.flatMap((section) =>
            section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded px-2 py-1 text-xs",
                  isActive(pathname, item.href)
                    ? "bg-chrome-hover font-medium text-chrome-text"
                    : "text-chrome-muted",
                )}
              >
                {item.label}
              </Link>
            )),
          )}
        </nav>
        <main className="mx-auto w-full max-w-[900px] px-3 py-5 md:px-8 md:py-8">
          <article className="min-h-[calc(100svh-4rem)] border border-ink/20 bg-paper px-5 py-8 text-ink shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] md:px-10 md:py-10">
            {children}
          </article>
        </main>
      </div>
    </div>
  )
}
