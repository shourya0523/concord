import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { Warren } from "@/components/mockups/warren"
import { getLearningModule, listConcepts } from "@/lib/data/learning"

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

  const conceptById = new Map(
    concepts.items.map((item) => [item.concept.id, item.concept]),
  )
  const firstQuestion = result.checkpoints.flatMap((checkpoint) => checkpoint.question_ids)[0]

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-muted-foreground">
          <Link href="/learn" className="hover:underline">
            Learn
          </Link>{" "}
          / {result.module.domain.toUpperCase()}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          {result.module.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {result.module.summary}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <MetadataPill>{result.module.estimated_minutes} min</MetadataPill>
          <MetadataPill>{result.checkpoints.length} checkpoints</MetadataPill>
          <MetadataPill>{result.source}</MetadataPill>
        </div>
      </header>

      <NotionCallout warren={<Warren mood="thinking" size={48} />}>
        Move in order: lesson → diagram → drill → quiz. Open the concept lab when a checkpoint
        needs a visual model.
      </NotionCallout>

      <PaperSheet seedKey={`roadmap-${result.module.id}`} torn={false}>
        <h2 className="text-sm font-semibold">Module roadmap</h2>
        <ol className="mt-5 space-y-1">
          {result.checkpoints.map((checkpoint, index) => {
            const concept = checkpoint.concept_id
              ? conceptById.get(checkpoint.concept_id)
              : undefined
            const content = (
              <>
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                    index === 0 ? "border-black bg-black text-[#f7f1e4]" : "border-border"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{checkpoint.kind}</span>
                  <span className="block text-sm font-medium">{checkpoint.title}</span>
                </span>
              </>
            )
            return (
              <li key={checkpoint.id} className="relative flex gap-3 py-3">
                {index < result.checkpoints.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-[-0.75rem] left-3.5 border-l border-dashed border-border"
                  />
                ) : null}
                {concept ? (
                  <Link
                    className="flex w-full gap-3 hover:bg-black/[0.03]"
                    href={`/concepts/${concept.slug}`}
                  >
                    {content}
                  </Link>
                ) : checkpoint.kind === "drill" || checkpoint.kind === "quiz" ? (
                  <Link
                    className="flex w-full gap-3 hover:bg-black/[0.03]"
                    href={firstQuestion ? `/study?question=${firstQuestion}` : "/study"}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex w-full gap-3">{content}</div>
                )}
              </li>
            )
          })}
        </ol>
      </PaperSheet>

      <div className="flex flex-wrap gap-2">
        <Link href={firstQuestion ? `/study?question=${firstQuestion}` : "/study"}>
          <Button>Start module drill</Button>
        </Link>
        {result.module.concept_ids
          .map((id) => conceptById.get(id))
          .filter(Boolean)
          .slice(0, 1)
          .map((concept) => (
            <Link key={concept!.id} href={`/concepts/${concept!.slug}`}>
              <Button variant="outline">Open diagram lab</Button>
            </Link>
          ))}
        <Link href="/prep/heat">
          <Button variant="ghost">Apply at a firm</Button>
        </Link>
      </div>
    </div>
  )
}
