import Link from "next/link"
import type { ReactNode } from "react"

import { ConcordLogo } from "@/components/concord-logo"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"

/**
 * Focused auth shell — brand mark + form on full-bleed cream (no dark bezels).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-paper text-ink">
      <MockupSvgFilters />
      <div className="relative mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 py-8 md:px-6 md:py-12">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" aria-label="Concord home" className="transition-opacity hover:opacity-80">
            <ConcordLogo size="md" priority />
          </Link>
          <Link
            href="/dashboard"
            className="text-xs text-chrome-muted underline-offset-4 hover:text-chrome-text hover:underline"
          >
            Continue without account
          </Link>
        </header>
        <main className="flex flex-1 flex-col justify-center">
          <div className="border border-border bg-paper px-5 py-8 text-ink md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
