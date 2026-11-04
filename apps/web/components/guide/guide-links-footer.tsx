import Link from "next/link"

import { guidePaths, publicConcepts, publicFirms } from "@/lib/seo/public-content"

const LIMIT = 8

/**
 * Landing-page footer that links straight into the public guide, so the
 * most important guide pages are one click from "/" (SEO plan step 3).
 */
export async function GuideLinksFooter() {
  const [concepts, firms] = await Promise.all([publicConcepts(), publicFirms()])
  const columns = [
    { title: "Technical concepts", links: concepts.slice(0, LIMIT).map((c) => ({ href: guidePaths.concept(c.slug), label: c.title })) },
    {
      title: "Interview prep by firm",
      links: firms.slice(0, LIMIT).map((f) => ({ href: guidePaths.firm(f.slug), label: `${f.name} interview prep` })),
    },
  ].filter((column) => column.links.length > 0)

  return (
    <footer className="relative z-10 border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 md:px-5">
        <div>
          <p className="font-display text-xl tracking-tight text-ink">Free interview guides</p>
          <Link href={guidePaths.hub} className="mt-2 inline-block text-sm text-ink underline underline-offset-4">
            Browse all guides
          </Link>
          <Link
            href={guidePaths.topicFrequency}
            className="mt-2 block text-sm text-ink underline-offset-4 hover:underline"
          >
            The most-asked interview topics
          </Link>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{column.title}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink underline-offset-4 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  )
}
