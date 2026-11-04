import Link from "next/link"
import type { ReactNode } from "react"

import { ConcordLogo } from "@/components/concord-logo"

/**
 * Public, crawlable guide (no login). Server-rendered only — no signed-in
 * API calls — so search engines and AI crawlers see the full content.
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="Concord home" className="flex items-center gap-2">
            <ConcordLogo size="sm" />
            <span className="font-display text-xl tracking-tight">Concord</span>
          </Link>
          <nav aria-label="Guide" className="flex items-center gap-1 text-sm">
            <Link href="/guide" className="hidden rounded-md px-3 py-2 font-medium underline-offset-4 hover:underline sm:inline">
              Guides
            </Link>
            <Link href="/sign-in" className="rounded-md px-3 py-2 font-medium underline-offset-4 hover:underline">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-md bg-ink px-4 py-2 font-medium text-paper hover:bg-ink/90">
              Start free
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
          <Link href="/guide" className="hover:text-foreground">All guides</Link>
          <Link href="/guide#concepts" className="hover:text-foreground">Concepts</Link>
          <Link href="/guide#modules" className="hover:text-foreground">Modules</Link>
          <Link href="/guide#firms" className="hover:text-foreground">Firms</Link>
          <Link href="/" className="hover:text-foreground">Concord home</Link>
        </div>
      </footer>
    </div>
  )
}
