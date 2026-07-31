"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@ibpe/ui/lib/utils"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"

const NAV = [
  {
    label: "Company",
    items: [
      { href: "/dashboard", label: "Home" },
      { href: "/companies/goldman-sachs", label: "Company room" },
      { href: "/prep/heat", label: "Topic heat" },
      { href: "/prep/rag", label: "Session pack" },
      { href: "/study", label: "Study" },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/learn", label: "Modules" },
      { href: "/concepts/leveraged-buyouts", label: "Concept labs" },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/plan", label: "Roadmap" },
      { href: "/simulator", label: "Simulator" },
      { href: "/settings", label: "Settings" },
    ],
  },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-svh bg-[#1a1a1a] text-foreground">
      <MockupSvgFilters />
      <aside className="hidden w-[224px] shrink-0 flex-col border-r border-[#333] bg-black px-2 py-3 text-[#e8e8e8] md:flex">
        <Link href="/dashboard" className="mb-5 rounded px-2 py-1.5 text-sm font-semibold hover:bg-[#222]">
          Concord
        </Link>
        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-5">
          {NAV.map((section) => (
            <section key={section.label}>
              <p className="px-2 pb-1 text-[11px] font-medium text-[#777]">{section.label}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`))
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded px-2 py-1 text-sm transition-colors",
                          active
                            ? "bg-[#2a2a2a] font-medium text-white"
                            : "text-[#aaa] hover:bg-[#1a1a1a] hover:text-white",
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
        <Link href="/sign-in" className="px-2 py-2 text-xs text-[#888] hover:text-white">
          Neon Auth · Sign in
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        <nav
          aria-label="Mobile workspace"
          className="flex gap-1 overflow-x-auto border-b border-[#333] bg-black px-3 py-2 md:hidden"
        >
          {NAV.flatMap((section) =>
            section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded px-2 py-1 text-xs",
                  pathname === item.href
                    ? "bg-[#2a2a2a] font-medium text-white"
                    : "text-[#aaa]",
                )}
              >
                {item.label}
              </Link>
            )),
          )}
        </nav>
        <main className="mx-auto w-full max-w-[900px] px-3 py-5 md:px-8 md:py-8">
          <article className="min-h-[calc(100svh-4rem)] border border-black/20 bg-[#f7f1e4] px-5 py-8 text-[#111] shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] md:px-10 md:py-10">
            {children}
          </article>
        </main>
      </div>
    </div>
  )
}
