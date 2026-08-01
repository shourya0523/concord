import Link from "next/link"
import type { ReactNode } from "react"

import { MockupSvgFilters } from "@/components/mockups/svg-filters"

/**
 * Focused auth shell — brand + form only (no product sidebar).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-chrome-workspace text-foreground">
      <MockupSvgFilters />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklch,var(--paper)_88%,transparent),_transparent_55%),linear-gradient(160deg,_color-mix(in_oklch,var(--chrome)_92%,#000)_0%,_var(--chrome-workspace)_45%,_color-mix(in_oklch,var(--paper)_18%,var(--chrome-workspace))_100%)]"
      />
      <div className="relative mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 py-8 md:px-6 md:py-12">
        <header className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-chrome-text transition-opacity hover:opacity-80"
          >
            Concord
          </Link>
          <Link
            href="/dashboard"
            className="text-xs text-chrome-muted underline-offset-4 hover:text-chrome-text hover:underline"
          >
            Continue without account
          </Link>
        </header>
        <main className="flex flex-1 flex-col justify-center">
          <div className="border border-ink/20 bg-paper px-5 py-8 text-ink shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
