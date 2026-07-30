import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { EditorialHeading, MetadataPill } from "@ibpe/ui/components/editorial"

import { TargetSelectIsland } from "@/components/target-select-island"

export const metadata = {
  title: "Interview simulator · IBPE",
  description: "Firm-configurable interview simulation shell",
}

export default function SimulatorPage() {
  return (
    <div className="space-y-8">
      <EditorialHeading eyebrow="Practice · simulator" as="h1">
        Interview simulator
      </EditorialHeading>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Configure firm flavour from your target set, then run a timed technical loop. Backend
        session APIs are stubbed — UI ships Mode A wiring first.
      </p>
      <div className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Firm flavour
        </p>
        <TargetSelectIsland />
      </div>
      <div className="flex flex-wrap gap-2">
        <MetadataPill tone="lime">45 min</MetadataPill>
        <MetadataPill>Technical + behavioural</MetadataPill>
        <MetadataPill>Stub session</MetadataPill>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/prep/rag">
          <Button>Warm up with pseudo-RAG</Button>
        </Link>
        <Link href="/study">
          <Button variant="outline">Enter study loop</Button>
        </Link>
      </div>
    </div>
  )
}
