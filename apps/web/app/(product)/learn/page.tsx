import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { Warren } from "@/components/mockups/warren"
import { listLearningModules } from "@/lib/data/learning"

export const metadata = {
  title: "Learn modules · Concord",
  description: "Prerequisite-aware IB and PE learning modules",
}

export const dynamic = "force-dynamic"

export default async function LearnPage() {
  const result = await listLearningModules()
  const recommended =
    result.items.find((module) => module.domain === "pe") ?? result.items[0]

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-muted-foreground">Concept lab / Modules</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Learn</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Lessons lead into diagram labs, active-recall drills, and checkpoints. Firm occurrence
          heat appears only as an optional bridge back to Company prep.
        </p>
      </header>

      {recommended ? (
        <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
          <p className="font-medium">Recommended next</p>
          <p className="mt-1 text-muted-foreground">
            {recommended.title} · {recommended.estimated_minutes} min ·{" "}
            {recommended.checkpoints.length} checkpoints.
          </p>
        </NotionCallout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <MetadataPill>{result.source}</MetadataPill>
        <MetadataPill>{result.items.length} modules</MetadataPill>
        {result.note ? <span className="text-xs text-muted-foreground">{result.note}</span> : null}
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {result.items.map((module) => (
          <li key={module.id}>
            <PaperSheet seedKey={`module-${module.id}`} torn={false} className="h-full">
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <MetadataPill>{module.domain.toUpperCase()}</MetadataPill>
                  <MetadataPill>{module.estimated_minutes} min</MetadataPill>
                </div>
                <h2 className="mt-4 text-xl font-semibold">{module.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {module.summary}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {module.checkpoints.length} checkpoints · {module.diagram_ids.length} diagrams
                </p>
                <Link className="mt-4" href={`/learn/${module.slug}`}>
                  <Button>Open roadmap</Button>
                </Link>
              </div>
            </PaperSheet>
          </li>
        ))}
      </ul>
    </div>
  )
}
