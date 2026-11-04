import Link from "next/link"
import type { ReactNode } from "react"

/** Visible breadcrumb trail; the last crumb is the current page. */
export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
      <ol className="flex flex-wrap gap-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex gap-1">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function GuideSection({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="font-display text-2xl tracking-tight md:text-3xl">{title}</h2>
      {children}
    </section>
  )
}

export function LinkList({ items }: { items: Array<{ href: string; label: string; note?: string }> }) {
  return (
    <ul className="divide-y divide-border/80 border-y border-border/80">
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
          <Link href={item.href} className="font-medium underline underline-offset-4">
            {item.label}
          </Link>
          {item.note ? <span className="text-sm text-muted-foreground">{item.note}</span> : null}
        </li>
      ))}
    </ul>
  )
}

export function SignUpCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <aside className="rounded-lg border border-border bg-background/40 px-5 py-5">
      <p className="max-w-2xl text-[15px] leading-relaxed">{children}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
      >
        Practise this free
      </Link>
    </aside>
  )
}
