import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { ModuleApplyCtaIsland } from "@/components/module-apply-cta-island"
import { ModuleHeatIsland } from "@/components/module-heat-island"
import {
  ModuleMasteryChip,
  ModuleRoadmapIsland,
  type RoadmapCheckpoint,
} from "@/components/module-roadmap-island"
import {
  Annotate,
  NotionCallout,
  PaperSheet,
  ProvenanceChip,
  RoughHover,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import {
  getConceptDetail,
  getLearningModule,
  listConcepts,
  listQuestionsForConcept,
} from "@/lib/data/learning"
import { pitfallForTopic } from "@/lib/pitfalls"
import { topicForConceptId, topicLabel } from "@/lib/topics"

type Props = {
  params: Promise<{ module: string }>
}

export const dynamic = "force-dynamic"

function studyHref(questionIds: string[], moduleSlug: string) {
  const params = new URLSearchParams()
  if (questionIds.length === 1) {
    params.set("question", questionIds[0]!)
  } else if (questionIds.length > 1) {
    params.set("questions", questionIds.join(","))
  }
  params.set("module", moduleSlug)
  params.set("mode", "module_drill")
  return `/study?${params.toString()}`
}

export async function generateMetadata({ params }: Props) {
  const { module } = await params
  const result = await getLearningModule(module)
  return {
    title: result ? `${result.module.title} · Learn` : "Module · Learn",
    description: result?.module.summary,
  }
}

export default async function LearningModulePage({ params }: Props) {
  const { module: slug } = await params
  const [result, concepts] = await Promise.all([getLearningModule(slug), listConcepts()])
  if (!result) notFound()

  const conceptSlugById = new Map(
    concepts.items.map((item) => [item.concept.id, item.concept.slug]),
  )
  const conceptTitleById = new Map(
    concepts.items.map((item) => [item.concept.id, item.concept.title]),
  )
  const checkpoints = [...result.checkpoints].sort((a, b) => a.position - b.position)
  const resolvedQuestionIds = new Map<string, string[]>()
  await Promise.all(
    checkpoints.map(async (checkpoint) => {
      if (
        checkpoint.question_ids.length > 0 ||
        !checkpoint.concept_id ||
        (checkpoint.kind !== "drill" && checkpoint.kind !== "quiz")
      ) {
        resolvedQuestionIds.set(checkpoint.id, checkpoint.question_ids)
        return
      }
      const questions = await listQuestionsForConcept(checkpoint.concept_id, 4)
      resolvedQuestionIds.set(
        checkpoint.id,
        questions.map((question) => question.id),
      )
    }),
  )
  const lessonConceptIds = [
    ...new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.kind === "lesson")
        .map((checkpoint) => checkpoint.concept_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const lessonConcepts = new Map(
    (
      await Promise.all(
        lessonConceptIds.map(async (conceptId) => {
          const detail = await getConceptDetail(conceptId)
          return detail ? ([conceptId, detail] as const) : null
        }),
      )
    ).filter((entry): entry is [string, NonNullable<Awaited<ReturnType<typeof getConceptDetail>>>] =>
      Boolean(entry),
    ),
  )

  const roadmap: RoadmapCheckpoint[] = checkpoints.map((checkpoint) => {
    let href: string | null = null
    if (checkpoint.kind === "drill" || checkpoint.kind === "quiz") {
      const ids = resolvedQuestionIds.get(checkpoint.id) ?? []
      if (ids.length > 0) {
        href = studyHref(ids, slug)
      } else if (checkpoint.concept_id) {
        const conceptSlug = conceptSlugById.get(checkpoint.concept_id)
        href = conceptSlug ? `/concepts/${conceptSlug}` : "/study"
      } else {
        href = "/study"
      }
    } else if (checkpoint.concept_id) {
      const conceptSlug = conceptSlugById.get(checkpoint.concept_id)
      href = conceptSlug ? `/concepts/${conceptSlug}` : null
    }
    return {
      id: checkpoint.id,
      kind: checkpoint.kind,
      title: checkpoint.title,
      href,
    }
  })

  const sessionCheckpoint = checkpoints.find(
    (checkpoint) =>
      (checkpoint.kind === "drill" || checkpoint.kind === "quiz") &&
      (resolvedQuestionIds.get(checkpoint.id)?.length ?? 0) > 0,
  )
  const sessionHref = sessionCheckpoint
    ? studyHref(resolvedQuestionIds.get(sessionCheckpoint.id) ?? [], slug)
    : "/study"

  const moduleTopics = [
    ...new Set(
      [
        ...result.module.concept_ids,
        ...checkpoints
          .map((checkpoint) => checkpoint.concept_id)
          .filter((id): id is string => Boolean(id)),
      ]
        .map((conceptId) => topicForConceptId(conceptId))
        .filter((topic): topic is string => Boolean(topic)),
    ),
  ]

  const track = (result.module.track ?? result.module.domain).toUpperCase()

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/learn" className="hover:text-foreground">
            Learn
          </Link>{" "}
          / {track}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          {result.module.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {result.module.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MetadataPill>{result.module.estimated_minutes} min</MetadataPill>
          <MetadataPill>{checkpoints.length} checkpoints</MetadataPill>
          <ModuleMasteryChip moduleId={result.module.id} />
          <MetadataPill tone="muted">{result.source}</MetadataPill>
        </div>
      </header>

      <ModuleRoadmapIsland
        moduleId={result.module.id}
        checkpoints={roadmap}
        sessionHref={sessionHref}
      />

      <ModuleHeatIsland topics={moduleTopics} />

      {checkpoints.some((checkpoint) => checkpoint.kind === "lesson") ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Lesson open state
              </p>
              <h2 className="mt-1 font-display text-3xl tracking-tight">Progressive notes</h2>
            </div>
            <SemanticPill tone="neutral" icon={false}>
              prereq → core → apply
            </SemanticPill>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {checkpoints
              .filter((checkpoint) => checkpoint.kind === "lesson")
              .map((checkpoint) => {
                const detail = checkpoint.concept_id
                  ? lessonConcepts.get(checkpoint.concept_id)
                  : null
                const concept = detail?.item.concept
                const topic = checkpoint.concept_id
                  ? topicForConceptId(checkpoint.concept_id)
                  : null
                const conceptSlug = concept?.slug ?? (
                  checkpoint.concept_id ? conceptSlugById.get(checkpoint.concept_id) : null
                )
                const prereqNames =
                  concept?.prerequisites
                    .map((id) => conceptTitleById.get(id) ?? id.replace(/^concept_/, "").replace(/_/g, " "))
                    .filter(Boolean) ?? []
                const summary = concept?.summary ?? result.module.summary
                return (
                  <PaperSheet
                    key={checkpoint.id}
                    seedKey={`lesson-${checkpoint.id}`}
                    torn={false}
                    className="h-full"
                  >
                    <article className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                            Checkpoint {checkpoint.position} · lesson
                          </p>
                          <h3 className="mt-1 font-display text-2xl leading-tight tracking-tight">
                            <RoughHover>{checkpoint.title}</RoughHover>
                          </h3>
                        </div>
                        {topic ? (
                          <MetadataPill>{topicLabel(topic)}</MetadataPill>
                        ) : null}
                      </div>

                      <NotionCallout>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Prereq
                        </p>
                        <p className="mt-1 text-sm leading-relaxed">
                          {prereqNames.length > 0
                            ? `Review ${prereqNames.join(", ")} before this checkpoint.`
                            : "No blocking prerequisite is attached; start by defining the terms in the prompt."}
                        </p>
                      </NotionCallout>

                      <div>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Core
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          <Annotate type="box" color="var(--ink)" padding={3}>
                            <span className="text-foreground">
                              {concept?.title ?? checkpoint.title}
                            </span>
                          </Annotate>{" "}
                          {summary}
                        </p>
                      </div>

                      <div>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Apply
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          Use this lesson to answer one interview prompt by stating the concept,
                          naming the dependency, and then applying it to{" "}
                          {topic ? topicLabel(topic) : "the module topic"} without changing the
                          question into unsupported numbers.
                        </p>
                      </div>

                      <WarrenCallout mood="thinking" bracket size={44}>
                        {pitfallForTopic(topic)}
                      </WarrenCallout>

                      {detail?.item.resources.length ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                            Resources
                          </p>
                          <ul className="space-y-1.5 text-sm">
                            {detail.item.resources.slice(0, 3).map((resource) => (
                              <li key={resource.id} className="flex flex-wrap items-center gap-2">
                                <ProvenanceChip provenance={resource.provenance} />
                                <a
                                  className="underline underline-offset-4"
                                  href={resource.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {resource.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {conceptSlug ? (
                        <Link
                          href={`/concepts/${conceptSlug}`}
                          className="inline-flex text-sm font-medium underline underline-offset-4"
                        >
                          Open concept lab →
                        </Link>
                      ) : null}
                    </article>
                  </PaperSheet>
                )
              })}
          </div>
        </section>
      ) : null}

      {checkpoints.some((checkpoint) => checkpoint.kind === "drill" || checkpoint.kind === "quiz") ? (
        <section className="space-y-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Module-scoped practice
            </p>
            <h2 className="mt-1 font-display text-3xl tracking-tight">Drills and quizzes</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {checkpoints
              .filter((checkpoint) => checkpoint.kind === "drill" || checkpoint.kind === "quiz")
              .map((checkpoint) => {
                const ids = resolvedQuestionIds.get(checkpoint.id) ?? []
                const topic = checkpoint.concept_id
                  ? topicForConceptId(checkpoint.concept_id)
                  : null
                const conceptSlug = checkpoint.concept_id
                  ? conceptSlugById.get(checkpoint.concept_id)
                  : null
                const href =
                  ids.length > 0
                    ? studyHref(ids, slug)
                    : conceptSlug
                      ? `/concepts/${conceptSlug}`
                      : topic
                        ? `/study?topic=${encodeURIComponent(topic)}&module=${encodeURIComponent(slug)}`
                        : "/study"
                return (
                  <PaperSheet
                    key={checkpoint.id}
                    seedKey={`practice-${checkpoint.id}`}
                    torn={false}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                            {checkpoint.kind}
                          </p>
                          <h3 className="mt-1 font-display text-2xl tracking-tight">
                            <RoughHover>{checkpoint.title}</RoughHover>
                          </h3>
                        </div>
                        {topic ? <MetadataPill>{topicLabel(topic)}</MetadataPill> : null}
                      </div>
                      {ids.length > 0 ? (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          Starts a module drill with {ids.length} published question
                          {ids.length === 1 ? "" : "s"} linked to this checkpoint.
                        </p>
                      ) : (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          No published question IDs are linked yet; continue through the concept lab
                          while the corpus mapping fills in.
                        </p>
                      )}
                      <Link href={href}>
                        <Button size="sm" variant={ids.length > 0 ? "default" : "outline"}>
                          {ids.length > 0 ? "Start checkpoint drill" : "Open concept lab"}
                        </Button>
                      </Link>
                    </div>
                  </PaperSheet>
                )
              })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Firm application
          </p>
          <h2 className="mt-1 font-display text-3xl tracking-tight">Apply this module</h2>
        </div>
        <ModuleApplyCtaIsland moduleSlug={slug} topics={moduleTopics} />
      </section>

      <WarrenCallout mood="thinking" bracket size={48}>
        {pitfallForTopic(moduleTopics[0] ?? null)}
      </WarrenCallout>
    </div>
  )
}
