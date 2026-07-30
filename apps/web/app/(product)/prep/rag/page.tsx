import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { RagPrepIsland } from "@/components/rag-prep-island"

export const metadata = {
  title: "Pseudo-RAG prep · IBPE",
  description: "Grounded retrieval pack with citation cards for selected firms",
}

export default function PseudoRagPage() {
  return (
    <div className="space-y-8">
      <EditorialHeading eyebrow="Mode A · grounded prep" as="h1">
        Pseudo-RAG session
      </EditorialHeading>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Retrieve a pack ranked by firm topic heat ∩ weak topics ∩ prompt similarity. Citations
        stay visible — Glassdoor never becomes the answer text.
      </p>
      <RagPrepIsland />
    </div>
  )
}
