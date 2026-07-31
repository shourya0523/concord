import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { ConceptLabHeader } from "@ibpe/ui/components/company-concept-headers"
import { ResourceLinkList } from "@ibpe/ui/components/resource-link-list"

import { DiagramIsland } from "@/components/diagram-island"
import { DIAGRAM_SOURCES, FIRMS } from "@/lib/mock-data"
import { getConceptDetail, listConcepts, listLearningModules } from "@/lib/data/learning"

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const result = await listConcepts()
  return result.items.map((item) => ({ slug: item.concept.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const result = await getConceptDetail(slug)
  const concept = result?.item.concept
  return {
    title: concept ? `${concept.title} · Concept lab` : "Concept lab · IBPE",
    description: concept?.summary ?? "Concept learning lab",
  }
}

export default async function ConceptLabPage({ params }: Props) {
  const { slug } = await params
  const [result, allConcepts, modules] = await Promise.all([
    getConceptDetail(slug),
    listConcepts(),
    listLearningModules(),
  ])
  if (!result) notFound()
  const { concept, resources } = result.item

  const diagram = DIAGRAM_SOURCES[slug]
  const relatedFirms = FIRMS.filter((f) => (concept.firm_relevance[f.id] ?? 0) >= 0.7)
  const parentModule = modules.items.find((module) => module.concept_ids.includes(concept.id))

  return (
    <div className="space-y-10">
      <ConceptLabHeader
        conceptName={concept.title}
        domain={concept.domain?.toUpperCase()}
        masteryLabel={result.source === "published" ? "Published lab" : "Foundation lab"}
        subtitle={concept.summary}
        actions={
          <>
            <Link href="/study">
              <Button>Start drill</Button>
            </Link>
            {relatedFirms[0] ? (
              <Link href={`/companies/${relatedFirms[0].slug}`}>
                <Button variant="outline">Apply at {relatedFirms[0].aliases[0] ?? relatedFirms[0].name}</Button>
              </Link>
            ) : null}
          </>
        }
      />

      {diagram ? (
        <DiagramIsland
          title={diagram.title}
          source={diagram.mermaid}
          a11yFallback={diagram.a11y}
        />
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-4">
          <h2 className="font-display text-3xl tracking-tight">Lab notes</h2>
          {parentModule ? (
            <p className="text-sm">
              Parent module:{" "}
              <Link className="underline" href={`/learn/${parentModule.slug}`}>
                {parentModule.title}
              </Link>
            </p>
          ) : null}
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Mode B ignores firm heat by default. Optional bridges below show where this concept
            over-indexes in reported interviews — still directional, not canonical answers.
          </p>
          {relatedFirms.length ? (
            <ul className="flex flex-wrap gap-2">
              {relatedFirms.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/companies/${f.slug}`}
                    className="rounded-full border border-border px-3 py-1 text-xs hover:border-lime/40"
                  >
                    {f.name} · {((concept.firm_relevance[f.id] ?? 0) * 100).toFixed(0)}% relevance
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            {allConcepts.items
              .map((item) => item.concept)
              .filter((c) => c.id !== concept.id)
              .slice(0, 6)
              .map((c) => (
              <Link
                key={c.id}
                href={`/concepts/${c.slug}`}
                className="text-sm text-foreground underline-offset-4 hover:underline"
              >
                {c.title}
              </Link>
              ))}
          </div>
        </section>
        <ResourceLinkList
          resources={
            resources.length
              ? resources.map((resource) => ({
                  id: resource.id,
                  label: resource.label,
                  href: resource.url,
                  kind: resource.kind,
                }))
              : [
                  {
                    id: "browse",
                    label: "Browse all concepts",
                    href: "/concepts/leveraged-buyouts",
                    kind: "internal",
                  },
                ]
          }
        />
      </div>
    </div>
  )
}
