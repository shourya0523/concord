import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { DiagramIsland } from "@/components/diagram-island"
import { LessonMarkdown } from "@/components/lesson-markdown"
import { ModuleApplyCtaIsland } from "@/components/module-apply-cta-island"
import { ModuleDiagramQuizIsland } from "@/components/module-diagram-quiz-island"
import { ModuleHeatIsland } from "@/components/module-heat-island"
import {
  ModuleMasteryChip,
  ModuleRoadmapIsland,
  type RoadmapCheckpoint,
} from "@/components/module-roadmap-island"
import {
  NotionCallout,
  PaperSheet,
  ProvenanceChip,
  RoughHover,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import type { DiagramAsset } from "@/lib/api/schemas"
import {
  getConceptDetail,
  getDiagramAssetsByIds,
  getLearningModule,
  getModuleCheckpointContent,
  getQuestionSummaries,
  listConcepts,
  listQuestionsForConcept,
  type QuestionSummary,
} from "@/lib/data/learning"
import { pitfallForTopic } from "@/lib/pitfalls"
import { topicForConceptId, topicLabel } from "@/lib/topics"

type Props = {
  params: Promise<{ module: string }>
}

export const dynamic = "force-dynamic"

const KIND_LABEL: Record<string, string> = {
  lesson: "lesson",
  concept_lab: "concept lab",
  diagram: "diagram",
  drill: "drill",
  quiz: "quiz",
}

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

function truncate(text: string, max = 110): string {
  const clean = text.replace(/^Question \d+:\s*/i, "")
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export async function generateMetadata({ params }: Props) {
  const { module } = await params
  const result = await getLearningModule(module)
  return {
    title: result ? `${result.module.title} · Learn` : "Module · Learn",
    description: result?.module.summary,
  }
}

function LinkedQuestions({
  questions,
  moduleSlug,
}: {
  questions: QuestionSummary[]
  moduleSlug: string
}) {
  if (questions.length === 0) return null
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Practise with
      </p>
      <ul className="space-y-1.5 text-sm">
        {questions.map((question) => (
          <li key={question.id} className="flex flex-wrap items-baseline gap-2">
            <Link
              className="underline underline-offset-4"
              href={studyHref([question.id], moduleSlug)}
            >
              {truncate(question.canonical_wording)}
            </Link>
            {question.difficulty ? <MetadataPill>{question.difficulty}</MetadataPill> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DiagramBlock({
  asset,
  moduleSlug,
  checkpointId,
  quiz,
}: {
  asset: DiagramAsset
  moduleSlug: string
  checkpointId: string
  quiz: boolean
}) {
  const a11y = asset.ref.a11y_fallback ?? asset.title
  if (asset.ref.format === "interactive-json") {
    return quiz ? (
      <ModuleDiagramQuizIsland
        moduleSlug={moduleSlug}
        checkpointId={checkpointId}
        title={asset.title}
        source={asset.body}
        a11yFallback={a11y}
      />
    ) : (
      <DiagramIsland
        title={asset.title}
        source={asset.body}
        a11yFallback={a11y}
        format="interactive-json"
      />
    )
  }
  return (
    <div className="space-y-2">
      <DiagramIsland title={asset.title} source={asset.body} a11yFallback={a11y} format="mermaid" />
      <details className="text-sm">
        <summary className="cursor-pointer font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Read the diagram in words
        </summary>
        <p className="mt-2 leading-relaxed text-foreground/90">{a11y}</p>
      </details>
    </div>
  )
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

  const diagramIds = checkpoints
    .map((checkpoint) => checkpoint.diagram_id)
    .filter((id): id is string => Boolean(id))
  const lessonConceptIds = [
    ...new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.kind === "lesson")
        .map((checkpoint) => checkpoint.concept_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const [content, diagrams, questionSummaries, lessonConceptEntries] = await Promise.all([
    getModuleCheckpointContent(result.module.id),
    getDiagramAssetsByIds(diagramIds),
    getQuestionSummaries([...resolvedQuestionIds.values()].flat()),
    Promise.all(
      lessonConceptIds.map(async (conceptId) => {
        const detail = await getConceptDetail(conceptId)
        return detail ? ([conceptId, detail] as const) : null
      }),
    ),
  ])
  const questionById = new Map(questionSummaries.map((question) => [question.id, question]))
  const lessonConcepts = new Map(
    lessonConceptEntries.filter(
      (entry): entry is NonNullable<typeof entry> => Boolean(entry),
    ),
  )
  const questionsFor = (checkpointId: string) =>
    (resolvedQuestionIds.get(checkpointId) ?? [])
      .map((id) => questionById.get(id))
      .filter((question): question is QuestionSummary => Boolean(question))

  const roadmap: RoadmapCheckpoint[] = checkpoints.map((checkpoint) => {
    let href: string | null = `#${checkpoint.id}`
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
        moduleSlug={slug}
        checkpoints={roadmap}
        sessionHref={sessionHref}
      />

      <ModuleHeatIsland topics={moduleTopics} />

      <section className="space-y-4" aria-labelledby="module-checkpoints">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Work through in order
            </p>
            <h2 id="module-checkpoints" className="mt-1 font-display text-3xl tracking-tight">
              Checkpoints
            </h2>
          </div>
          <SemanticPill tone="neutral" icon={false}>
            learn → see → test → drill
          </SemanticPill>
        </div>

        <ol className="space-y-5">
          {checkpoints.map((checkpoint) => {
            const topic = checkpoint.concept_id ? topicForConceptId(checkpoint.concept_id) : null
            const entry = content.get(checkpoint.id)
            const body = entry?.body_markdown ?? null
            const quiz = entry?.metadata?.mode === "quiz"
            const asset = checkpoint.diagram_id ? diagrams.get(checkpoint.diagram_id) : undefined
            const linked = questionsFor(checkpoint.id)
            const conceptSlug = checkpoint.concept_id
              ? conceptSlugById.get(checkpoint.concept_id)
              : null
            const kicker = (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Checkpoint {checkpoint.position} · {quiz ? "diagram quiz" : KIND_LABEL[checkpoint.kind]}
                  </p>
                  <h3 className="mt-1 font-display text-2xl leading-tight tracking-tight">
                    <RoughHover>{checkpoint.title}</RoughHover>
                  </h3>
                </div>
                {topic ? <MetadataPill>{topicLabel(topic)}</MetadataPill> : null}
              </div>
            )

            if (checkpoint.kind === "drill" || checkpoint.kind === "quiz") {
              const ids = resolvedQuestionIds.get(checkpoint.id) ?? []
              const href =
                ids.length > 0
                  ? studyHref(ids, slug)
                  : conceptSlug
                    ? `/concepts/${conceptSlug}`
                    : topic
                      ? `/study?topic=${encodeURIComponent(topic)}&module=${encodeURIComponent(slug)}`
                      : "/study"
              return (
                <li key={checkpoint.id} id={checkpoint.id} className="scroll-mt-24">
                  <PaperSheet seedKey={`practice-${checkpoint.id}`}>
                    <div className="space-y-3">
                      {kicker}
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {ids.length > 0
                          ? `Starts a module drill with ${ids.length} question${ids.length === 1 ? "" : "s"} linked to this checkpoint. Answer out loud first, then compare.`
                          : "No published question IDs are linked yet; continue through the concept lab while the corpus mapping fills in."}
                      </p>
                      <LinkedQuestions questions={linked} moduleSlug={slug} />
                      <Link href={href}>
                        <Button size="sm" variant={ids.length > 0 ? "default" : "outline"}>
                          {ids.length > 0 ? "Start checkpoint drill" : "Open concept lab"}
                        </Button>
                      </Link>
                    </div>
                  </PaperSheet>
                </li>
              )
            }

            if (checkpoint.kind === "diagram") {
              return (
                <li key={checkpoint.id} id={checkpoint.id} className="scroll-mt-24">
                  <PaperSheet seedKey={`diagram-${checkpoint.id}`}>
                    <div className="space-y-4">
                      {kicker}
                      {asset ? (
                        <DiagramBlock
                          asset={asset}
                          moduleSlug={slug}
                          checkpointId={checkpoint.id}
                          quiz={quiz}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          This diagram is not published yet.
                        </p>
                      )}
                      <LinkedQuestions questions={linked} moduleSlug={slug} />
                    </div>
                  </PaperSheet>
                </li>
              )
            }

            // lesson + concept_lab
            const detail = checkpoint.concept_id ? lessonConcepts.get(checkpoint.concept_id) : null
            const concept = detail?.item.concept
            const prereqNames =
              concept?.prerequisites
                .map(
                  (id) =>
                    conceptTitleById.get(id) ??
                    id.replace(/^concept_/, "").replace(/_/g, " "),
                )
                .filter(Boolean) ?? []
            return (
              <li key={checkpoint.id} id={checkpoint.id} className="scroll-mt-24">
                <PaperSheet seedKey={`lesson-${checkpoint.id}`}>
                  <article className="space-y-4">
                    {kicker}

                    {checkpoint.kind === "lesson" ? (
                      <NotionCallout>
                        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Prereq
                        </p>
                        <p className="mt-1 text-sm leading-relaxed">
                          {prereqNames.length > 0
                            ? `Review ${prereqNames.join(", ")} before this checkpoint.`
                            : "No blocking prerequisite — start here."}
                        </p>
                      </NotionCallout>
                    ) : null}

                    {body ? (
                      <LessonMarkdown markdown={body} className="max-w-3xl" />
                    ) : (
                      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                        {concept?.summary ?? result.module.summary}
                      </p>
                    )}

                    {asset ? (
                      <DiagramBlock
                        asset={asset}
                        moduleSlug={slug}
                        checkpointId={checkpoint.id}
                        quiz={false}
                      />
                    ) : null}

                    {checkpoint.kind === "lesson" ? (
                      <WarrenCallout mood="thinking" bracket size={44}>
                        {pitfallForTopic(topic)}
                      </WarrenCallout>
                    ) : null}

                    <LinkedQuestions questions={linked} moduleSlug={slug} />

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
              </li>
            )
          })}
        </ol>
      </section>

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
