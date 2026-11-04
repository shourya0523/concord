import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Breadcrumbs, GuideSection, LinkList, SignUpCta } from "@/components/guide/guide-ui"
import { guidePaths, publicModule, signUpFor } from "@/lib/seo/public-content"

export const revalidate = 3600

/** Render on first request, then cache (ISR) — no build-time DB dependency. */
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await publicModule(slug)
  if (!data) return { title: "Module not found", robots: { index: false } }
  const { module: learningModule } = data
  const title = `${learningModule.title}: interview study module`
  return {
    title,
    description: learningModule.summary,
    alternates: { canonical: guidePaths.module(learningModule.slug) },
    openGraph: { title, description: learningModule.summary, type: "article", url: guidePaths.module(learningModule.slug) },
  }
}

export default async function GuideModulePage({ params }: Props) {
  const { slug } = await params
  const data = await publicModule(slug)
  if (!data) notFound()
  const { module: learningModule, concepts, checkpoints } = data

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: "Guides", href: guidePaths.hub }, { label: learningModule.title }]} />
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">{learningModule.title}</h1>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {String(learningModule.domain).toUpperCase()} · about {learningModule.estimated_minutes} min
        </p>
        <p className="max-w-2xl text-[17px] leading-relaxed">{learningModule.summary}</p>
      </header>

      {concepts.length > 0 ? (
        <GuideSection title="Concepts covered">
          <LinkList
            items={concepts.map((concept) => ({
              href: guidePaths.concept(concept.slug),
              label: concept.title,
            }))}
          />
        </GuideSection>
      ) : null}

      {checkpoints.length > 0 ? (
        <GuideSection title="What you'll work through">
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
            {checkpoints.map((checkpoint) => (
              <li key={checkpoint.id}>{checkpoint.title}</li>
            ))}
          </ol>
        </GuideSection>
      ) : null}

      <SignUpCta href={signUpFor(`/learn/${learningModule.slug}`)}>
        Work through {learningModule.title} in Concord, with graded checkpoints and drills.
      </SignUpCta>
    </article>
  )
}
