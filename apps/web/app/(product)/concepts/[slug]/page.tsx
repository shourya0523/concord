import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { ConceptFirmBridgesIsland } from "@/components/concept-firm-bridges-island"
import { ConceptModulePeekIsland } from "@/components/concept-module-peek-island"
import { DiagramIsland } from "@/components/diagram-island"
import {
  Annotate,
  PaperSheet,
  ProvenanceChip,
  RoughHover,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import {
  getConceptDetail,
  listConcepts,
  listLearningModules,
  listQuestionsForConcept,
} from "@/lib/data/learning"
import { pitfallForTopic } from "@/lib/pitfalls"
import { topicLabel } from "@/lib/topics"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const result = await getConceptDetail(slug)
  const concept = result?.item.concept
  return {
    title: concept ? `${concept.title} · Concept lab` : "Concept lab · Concord",
    description: concept?.summary ?? "Concept learning lab",
  }
}

function truncate(text: string, max = 96): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export default async function ConceptLabPage({ params }: Props) {
  const { slug } = await params
  const [result, allConcepts, modules] = await Promise.all([
    getConceptDetail(slug),
    listConcepts(),
    listLearningModules(),
  ])
  if (!result) notFound()
  const { concept, topic, diagrams, resources } = result.item
  const questions = await listQuestionsForConcept(concept.id, 4)

  const parentModule = modules.items.find((module) =>
    module.concept_ids.includes(concept.id)
  )
  const prerequisites = concept.prerequisites
    .map(
      (id) => allConcepts.items.find((item) => item.concept.id === id)?.concept
    )
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate)
    )
  const prereqPath = [
    ...prerequisites.map((prerequisite, index) => ({
      concept: prerequisite,
      current: false,
      ordinal: index + 1,
    })),
    { concept, current: true, ordinal: prerequisites.length + 1 },
  ]
  const diagram = diagrams[0]
  const firmEntries = Object.entries(concept.firm_relevance)
    .filter(([, intensity]) => intensity >= 0.5)
    .map(([firmId, intensity]) => ({ firmId, intensity }))
    .sort((a, b) => b.intensity - a.intensity)

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/learn" className="hover:text-foreground">
            Learn
          </Link>
          {parentModule ? (
            <>
              {" / "}
              <Link
                href={`/learn/${parentModule.slug}`}
                className="hover:text-foreground"
              >
                {parentModule.title}
              </Link>
            </>
          ) : null}
          {" / Concept lab"}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          {concept.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MetadataPill>
            {(concept.domain ?? "both").toUpperCase()}
          </MetadataPill>
          {topic ? <MetadataPill>{topicLabel(topic)}</MetadataPill> : null}
          <MetadataPill tone="muted">
            mastery builds after your first drill
          </MetadataPill>
        </div>
        {concept.summary ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {concept.summary}
          </p>
        ) : null}
      </header>

      {diagram ? (
        <PaperSheet seedKey={`concept-diagram-${concept.id}`} torn={false}>
          <DiagramIsland
            title={diagram.title}
            source={diagram.body}
            a11yFallback={
              diagram.ref.a11y_fallback ?? concept.summary ?? diagram.title
            }
          />
        </PaperSheet>
      ) : null}

      <section className="space-y-6">
        <h2 className="font-display text-3xl tracking-tight">Lab notes</h2>
        <PaperSheet seedKey={`concept-prereqs-${concept.id}`} torn={false}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Prerequisite mini-map
            </h3>
            <SemanticPill
              tone={prerequisites.length > 0 ? "milestone" : "neutral"}
              icon={false}
            >
              {prerequisites.length > 0
                ? `${prerequisites.length} before this lab`
                : "No prereq gate"}
            </SemanticPill>
          </div>
          <ol
            className="mt-4 space-y-2"
            aria-label={`Prerequisite path ending at ${concept.title}`}
          >
            {prereqPath.map((entry, index) => (
              <li key={entry.concept.id} className="relative flex gap-3 py-2">
                {index < prereqPath.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-9 bottom-[-0.65rem] left-[0.8125rem] border-l border-dashed border-border"
                  />
                ) : null}
                {entry.current ? (
                  <Annotate type="circle" color="var(--ink)" padding={3}>
                    <span className="flex size-7 items-center justify-center rounded-full border border-ink bg-ink text-xs text-paper">
                      {entry.ordinal}
                    </span>
                  </Annotate>
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                    {entry.ordinal}
                  </span>
                )}
                <div className="min-w-0 pt-0.5">
                  <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {entry.current ? "current lab" : "prerequisite"}
                  </p>
                  {entry.current ? (
                    <span className="text-sm font-medium">
                      {entry.concept.title}
                    </span>
                  ) : (
                    <Link
                      className="text-sm font-medium underline-offset-4 hover:underline"
                      href={`/concepts/${entry.concept.slug}`}
                    >
                      <RoughHover>{entry.concept.title}</RoughHover>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </PaperSheet>
        <div>
          <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Core
          </h3>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed">
            {concept.summary}
          </p>
          {diagram?.ref.a11y_fallback ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {diagram.ref.a11y_fallback}
            </p>
          ) : null}
        </div>
        <div>
          <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Apply at firm
          </h3>
          {firmEntries.length > 0 ? (
            <div className="mt-2">
              <ConceptFirmBridgesIsland entries={firmEntries} topic={topic} />
            </div>
          ) : (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Firm bridges appear here once occurrence signals are published for
              this topic — directional heat, never answer text.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Linked questions
          </h2>
          {questions.length > 0 ? (
            <>
              <ul className="mt-3 space-y-2">
                {questions.map((question) => (
                  <li
                    key={question.id}
                    className="flex flex-wrap items-baseline gap-2 text-sm"
                  >
                    <Link
                      className="underline underline-offset-4"
                      href={`/study?question=${question.id}`}
                    >
                      {truncate(question.canonical_wording)}
                    </Link>
                    {question.difficulty ? (
                      <MetadataPill>{question.difficulty}</MetadataPill>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Link
                className="mt-4 inline-block"
                href={`/study?question=${questions[0]!.id}`}
              >
                <Button>Start drill</Button>
              </Link>
            </>
          ) : (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              No published questions for this topic yet — drills appear after
              the next corpus import.
            </p>
          )}
        </section>

        <aside className="space-y-6">
          {resources.length > 0 ? (
            <section>
              <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Resource rail
              </h2>
              <ul className="mt-2 divide-y divide-border/80">
                {resources.map((resource) => (
                  <li
                    key={resource.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-sm"
                  >
                    <a
                      className="font-medium underline underline-offset-4"
                      href={resource.url}
                      {...(resource.kind === "external"
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                    >
                      {resource.label}
                    </a>
                    <ProvenanceChip provenance={resource.provenance} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {parentModule ? (
            <ConceptModulePeekIsland
              moduleId={parentModule.id}
              moduleSlug={parentModule.slug}
              moduleTitle={parentModule.title}
              checkpoints={[...parentModule.checkpoints]
                .sort((a, b) => a.position - b.position)
                .map((checkpoint) => ({
                  id: checkpoint.id,
                  title: checkpoint.title,
                  kind: checkpoint.kind,
                }))}
            />
          ) : null}
        </aside>
      </div>

      <WarrenCallout mood="thinking" bracket size={48}>
        {pitfallForTopic(topic)}
      </WarrenCallout>
    </div>
  )
}
