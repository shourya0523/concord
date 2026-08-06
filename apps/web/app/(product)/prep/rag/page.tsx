import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { RagPrepIsland } from "@/components/rag-prep-island"
import { topicLabel } from "@/lib/topics"

export const metadata = {
  title: "Session pack · Concord",
  description:
    "Build a practice pack for your target firms — ranked by what they ask most, your weak topics, and your focus prompt.",
}

type Props = {
  searchParams: Promise<{
    firm?: string | string[]
    firms?: string | string[]
    topic?: string | string[]
  }>
}

function valuesFromParam(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.flatMap((item) =>
    item
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

export default async function PseudoRagPage({ searchParams }: Props) {
  const params = await searchParams
  const initialFirmIds = [
    ...new Set([...valuesFromParam(params.firm), ...valuesFromParam(params.firms)]),
  ]
  const initialTopic = valuesFromParam(params.topic)[0] ?? null

  return (
    <div className="space-y-8">
      <EditorialHeading eyebrow="Company prep · session pack" as="h1">
        Session pack
      </EditorialHeading>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Build a practice set ranked by what your target firms ask most, topics
        you are weak on, and your focus prompt. Every question keeps its
        sources — interview reports only help ranking, never supply the answer
        text.
        {initialTopic ? ` Focus topic: ${topicLabel(initialTopic)}.` : ""}
      </p>
      <RagPrepIsland initialFirmIds={initialFirmIds} initialTopic={initialTopic} />
    </div>
  )
}
