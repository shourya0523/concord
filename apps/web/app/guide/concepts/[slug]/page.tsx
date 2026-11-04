import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DiagramIsland } from "@/components/diagram-island"
import { Breadcrumbs, GuideSection, LinkList, SignUpCta } from "@/components/guide/guide-ui"
import { pitfallForTopic } from "@/lib/pitfalls"
import { guidePaths, publicConcept, signUpFor } from "@/lib/seo/public-content"
import { topicLabel } from "@/lib/topics"

export const revalidate = 3600

/** Render on first request, then cache (ISR) — no build-time DB dependency. */
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await publicConcept(slug)
  if (!data) return { title: "Concept not found", robots: { index: false } }
  const { concept } = data
  const title = `${concept.title}: IB and PE interview guide`
  const description =
    concept.summary ?? `How ${concept.title} comes up in investment banking and private equity interviews.`
  return {
    title,
    description,
    alternates: { canonical: guidePaths.concept(concept.slug) },
    openGraph: { title, description, type: "article", url: guidePaths.concept(concept.slug) },
  }
}

export default async function GuideConceptPage({ params }: Props) {
  const { slug } = await params
  const data = await publicConcept(slug)
  if (!data) notFound()
  const { concept, topic, diagram, parentModule, prerequisites, related, askedAt } = data

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Guides", href: guidePaths.hub },
            ...(parentModule && parentModule.title !== concept.title
              ? [{ label: parentModule.title, href: guidePaths.module(parentModule.slug) }]
              : []),
            { label: concept.title },
          ]}
          currentPath={guidePaths.concept(concept.slug)}
        />
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">{concept.title}</h1>
        {topic ? (
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {(concept.domain ?? "both").toUpperCase()} · {topicLabel(topic)}
          </p>
        ) : null}
        {concept.summary ? <p className="max-w-2xl text-[17px] leading-relaxed">{concept.summary}</p> : null}
      </header>

      {diagram ? (
        <section className="space-y-2">
          <DiagramIsland
            title={diagram.title}
            source={diagram.body}
            format={diagram.ref.format}
            a11yFallback={diagram.ref.a11y_fallback ?? concept.summary ?? diagram.title}
          />
          {diagram.ref.a11y_fallback ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{diagram.ref.a11y_fallback}</p>
          ) : null}
        </section>
      ) : null}

      <GuideSection title="Common pitfall">
        <p className="max-w-2xl text-[15px] leading-relaxed">{pitfallForTopic(topic)}</p>
      </GuideSection>

      {prerequisites.length > 0 ? (
        <GuideSection title="Learn these first">
          <LinkList items={prerequisites.map((c) => ({ href: guidePaths.concept(c.slug), label: c.title }))} />
        </GuideSection>
      ) : null}

      {askedAt.length > 0 ? (
        <GuideSection title={`Firms that ask about ${concept.title}`}>
          <LinkList
            items={askedAt.map((firm) => ({ href: guidePaths.firm(firm.slug), label: `${firm.name} interview prep` }))}
          />
        </GuideSection>
      ) : null}

      {parentModule ? (
        <GuideSection title="Study module">
          <LinkList
            items={[
              {
                href: guidePaths.module(parentModule.slug),
                label: parentModule.title,
                note: `${parentModule.estimated_minutes} min`,
              },
            ]}
          />
        </GuideSection>
      ) : null}

      {related.length > 0 && parentModule ? (
        <GuideSection title={`More in ${parentModule.title}`}>
          <LinkList items={related.map((c) => ({ href: guidePaths.concept(c.slug), label: c.title }))} />
        </GuideSection>
      ) : null}

      <SignUpCta href={signUpFor(`/concepts/${concept.slug}`)}>
        Drill {concept.title} questions in Concord and get every answer graded. It takes about 12 minutes a day.
      </SignUpCta>
    </article>
  )
}
