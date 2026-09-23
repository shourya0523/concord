import type { ReactNode } from "react"
import Link from "next/link"

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Concord · Admin
          </p>
          <nav className="flex gap-4 text-sm">
            <Link className="underline-offset-4 hover:underline" href="/admin/review">
              Review queue
            </Link>
            <Link className="underline-offset-4 hover:underline" href="/learn">
              Back to app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
