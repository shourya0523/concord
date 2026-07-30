"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@ibpe/ui/lib/utils"

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/prep/heat", label: "Heat" },
  { href: "/prep/rag", label: "Prep" },
  { href: "/companies/goldman-sachs", label: "Companies" },
  { href: "/concepts/leveraged-buyouts", label: "Concepts" },
  { href: "/study", label: "Study" },
  { href: "/simulator", label: "Simulator" },
  { href: "/settings", label: "Settings" },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklch,var(--lime)_12%,transparent),_transparent_55%),linear-gradient(180deg,color-mix(in_oklch,var(--ink)_4%,transparent),transparent_40%)]"
      />
      <header className="relative z-[1] border-b border-border/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/dashboard" className="group flex min-w-0 items-baseline gap-2">
            <span className="font-display text-2xl tracking-tight md:text-[1.75rem]">IBPE</span>
            <span className="hidden truncate font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:inline">
              Editorial Finance Terminal
            </span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href.split("/").slice(0, 2).join("/") || item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-[8px] px-2.5 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors duration-[var(--duration-micro)]",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <Link
            href="/sign-in"
            className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign in
          </Link>
        </div>
        <div className="relative z-[1] flex gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] tracking-wide uppercase",
                pathname.startsWith(item.href)
                  ? "border-lime/50 bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </header>
      <div className="relative z-[1] mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">{children}</div>
    </div>
  )
}
