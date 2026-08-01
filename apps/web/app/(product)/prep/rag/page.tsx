import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { RagPrepIsland } from "@/components/rag-prep-island"
import { topicLabel } from "@/lib/topics"

export const metadata = {
  title: "Pseudo-RAG prep · IBPE",
  description: "Grounded retrieval pack with citation cards for selected firms",
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
      <EditorialHeading eyebrow="Mode A · grounded prep" as="h1">
        Pseudo-RAG session
      </EditorialHeading>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Retrieve a pack ranked by firm topic heat ∩ weak topics ∩ prompt similarity. Citations
        stay visible — Glassdoor never becomes the answer text.
        {initialTopic ? ` Focus topic: ${topicLabel(initialTopic)}.` : ""}
      </p>
      <RagPrepIsland initialFirmIds={initialFirmIds} initialTopic={initialTopic} />
    </div>
  )
}
