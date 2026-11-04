import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DiagramIsland } from "@/components/diagram-island"
import { Breadcrumbs, GuideSection, JsonLd, LinkList, LockedCard, SignUpCta } from "@/components/guide/guide-ui"
import { LessonMarkdown } from "@/components/lesson-markdown"
import { pitfallForTopic } from "@/lib/pitfalls"
import { isAnswerPublic, unlockHref } from "@/lib/seo/access-policy"
import { lessonExcerptsForConcept } from "@/lib/seo/lesson-excerpts"
import { guidePaths, publicConcept, signUpFor } from "@/lib/seo/public-content"
import { learningResourceLd } from "@/lib/seo/structured-data"
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
  const lessons = lessonExcerptsForConcept(concept.id)
  const lessonAppPath = parentModule ? `/learn/${parentModule.slug}` : `/concepts/${concept.slug}`
  const fullLessonHref = unlockHref(lessonAppPath)
  const answersPublic = isAnswerPublic(concept.slug)

  return (
    <article className="space-y-10">
      <JsonLd
        data={learningResourceLd({
          name: concept.title,
          description: concept.summary ?? null,
          path: guidePaths.concept(concept.slug),
          course: parentModule ? { name: parentModule.title, path: guidePaths.module(parentModule.slug) } : null,
        })}
      />
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

      {lessons.map((lesson) => (
        <section key={lesson.checkpointId} className="space-y-4" aria-labelledby={lesson.checkpointId}>
          <h2 id={lesson.checkpointId} className="font-display text-2xl tracking-tight md:text-3xl">
            {lesson.title}
          </h2>
          <div className="max-w-2xl space-y-2">
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {lesson.lead.heading}
            </h3>
            <LessonMarkdown markdown={lesson.lead.body} />
          </div>
          {lesson.answer && !answersPublic ? (
            <LockedCard
              label="How to answer in an interview"
              teaser={`Concord's word-for-word interview answer for “${lesson.title}”, plus the full lesson and graded practice.`}
              href={fullLessonHref}
              cta="See the answer with a free account"
            />
          ) : null}
          {lesson.answer && answersPublic ? (
            <div className="max-w-2xl space-y-2 rounded-lg border border-border bg-background/40 px-5 py-4">
              <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                How to answer in an interview
              </h3>
              <LessonMarkdown markdown={lesson.answer.body} />
            </div>
          ) : null}
          <Link href={fullLessonHref} className="inline-block text-sm underline underline-offset-4">
            Read the full lesson in Concord
          </Link>
        </section>
      ))}

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
