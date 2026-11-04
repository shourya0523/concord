import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Breadcrumbs, GuideSection, LinkList, SignUpCta } from "@/components/guide/guide-ui"
import { guidePaths, publicFirm, signUpFor } from "@/lib/seo/public-content"
import { conceptSlugForTopic, topicLabel } from "@/lib/topics"

export const revalidate = 3600

/** Render on first request, then cache (ISR) — no build-time DB dependency. */
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ firm: string }> }

function heatWord(intensity: number): string {
  if (intensity >= 0.66) return "Asked often"
  if (intensity >= 0.33) return "Asked sometimes"
  return "Asked occasionally"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { firm: slug } = await params
  const data = await publicFirm(slug)
  if (!data) return { title: "Firm not found", robots: { index: false } }
  const { firm } = data
  const title = `${firm.name} interview questions and prep`
  const description = `Which technical topics ${firm.name} tends to ask in investment banking and private equity interviews, based on ${firm.signals} interview reports.`
  return {
    title,
    description,
    alternates: { canonical: guidePaths.firm(firm.slug) },
    openGraph: { title, description, type: "article", url: guidePaths.firm(firm.slug) },
  }
}

export default async function GuideFirmPage({ params }: Props) {
  const { firm: slug } = await params
  const data = await publicFirm(slug)
  if (!data) notFound()
  const { firm, topics, relevantConcepts, coreConcepts } = data
  const conceptsToPrep = relevantConcepts.length > 0 ? relevantConcepts : coreConcepts

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: "Guides", href: guidePaths.hub }, { label: firm.name }]} currentPath={guidePaths.firm(firm.slug)} />
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          {firm.name} interview prep
        </h1>
        <p className="max-w-2xl text-[17px] leading-relaxed">
          Concord has tracked {firm.signals} interview {firm.signals === 1 ? "report" : "reports"} for {firm.name}.
          {topics.length > 0 ? " These are the technical topics that come up, from most to least frequent." : ""}
        </p>
      </header>

      {topics.length > 0 ? (
        <GuideSection title={`What ${firm.name} asks about`}>
          <LinkList
            items={topics.map((t) => {
              const conceptSlug = conceptSlugForTopic(t.topic)
              return {
                href: conceptSlug ? guidePaths.concept(conceptSlug) : undefined,
                label: topicLabel(t.topic),
                note: heatWord(t.intensity),
              }
            })}
          />
        </GuideSection>
      ) : null}

      {conceptsToPrep.length > 0 ? (
        <GuideSection
          title={relevantConcepts.length > 0 ? `Concepts to prepare for ${firm.name}` : "Core technicals to prepare"}
        >
          <LinkList items={conceptsToPrep.map((c) => ({ href: guidePaths.concept(c.slug), label: c.title }))} />
        </GuideSection>
      ) : null}

      <SignUpCta href={signUpFor(`/companies/${firm.slug}`)}>
        Open the {firm.name} prep room in Concord: practise the questions this firm asks and get every answer graded.
      </SignUpCta>
    </article>
  )
}
