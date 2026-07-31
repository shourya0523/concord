import Link from "next/link"

import { JourneyShell } from "@/components/mockups/journey-shell"

const PAGES = [
  {
    href: "/mockups/mode-a",
    title: "Goldman Sachs",
    body: "Topic heat → session pack → layered study",
  },
  {
    href: "/mockups/mode-b",
    title: "Learn",
    body: "Modules → diagram lab → quiz → apply at firm",
  },
  {
    href: "/mockups/plan-sim",
    title: "Study plan",
    body: "Roadmap → firm mock → score",
  },
] as const

export const metadata = {
  title: "Concord",
}

export default function MockupsIndexPage() {
  return (
    <JourneyShell
      pageTitle="Home"
      breadcrumb="Concord"
      sections={[
        {
          title: "Pages",
          pages: PAGES.map((p) => ({
            id: p.href,
            label: p.title,
            href: p.href,
          })),
        },
      ]}
    >
      <p className="mb-6 text-sm text-muted-foreground">
        Open a page from the sidebar. Dark chrome · cream document · pastel accents on data.
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {PAGES.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="block px-3 py-3 hover:bg-black/[0.03]">
              <span className="block text-sm font-medium text-foreground">{p.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{p.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </JourneyShell>
  )
}
