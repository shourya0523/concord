import Link from "next/link"
import { notFound } from "next/navigation"

import { MetadataPill } from "@ibpe/ui/components/editorial"

import { ModuleHeatIsland } from "@/components/module-heat-island"
import {
  ModuleMasteryChip,
  ModuleRoadmapIsland,
  type RoadmapCheckpoint,
} from "@/components/module-roadmap-island"
import { WarrenCallout } from "@/components/paper"
import { getLearningModule, listConcepts } from "@/lib/data/learning"
import { pitfallForTopic } from "@/lib/pitfalls"
import { topicForConceptId } from "@/lib/topics"

type Props = {
  params: Promise<{ module: string }>
}

export const dynamic = "force-dynamic"

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
  const checkpoints = [...result.checkpoints].sort((a, b) => a.position - b.position)

  const roadmap: RoadmapCheckpoint[] = checkpoints.map((checkpoint) => {
    let href: string | null = null
    if (checkpoint.kind === "drill" || checkpoint.kind === "quiz") {
      href = checkpoint.question_ids[0]
        ? `/study?question=${checkpoint.question_ids[0]}`
        : "/study"
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
      checkpoint.question_ids.length > 0,
  )
  const sessionHref = sessionCheckpoint
    ? `/study?question=${sessionCheckpoint.question_ids[0]}`
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

      <WarrenCallout mood="thinking" bracket size={48}>
        {pitfallForTopic(moduleTopics[0] ?? null)}
      </WarrenCallout>
    </div>
  )
}
