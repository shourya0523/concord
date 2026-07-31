import { MetadataPill } from "@ibpe/ui/components/editorial"

import { LearnCatalogIsland } from "@/components/learn-catalog-island"
import { listLearningModules } from "@/lib/data/learning"

export const metadata = {
  title: "Learn modules · Concord",
  description: "Prerequisite-aware IB and PE learning modules",
}

export const dynamic = "force-dynamic"

export default async function LearnPage() {
  const result = await listLearningModules()

  const modules = result.items.map((module) => ({
    id: module.id,
    slug: module.slug,
    title: module.title,
    summary: module.summary,
    domain: module.domain,
    track: module.track ?? null,
    estimatedMinutes: module.estimated_minutes,
    checkpointCount: module.checkpoints.length,
    prereqModuleIds: module.prereq_module_ids,
  }))

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Mode B · Learn
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          Learn
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Modules package teaching into a path — lessons lead into diagram labs, active-recall
          drills, and quizzes. Firm occurrence heat appears only as an optional bridge back to
          Company prep.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MetadataPill tone="muted">{result.source}</MetadataPill>
          {result.note ? (
            <span className="text-xs text-muted-foreground">{result.note}</span>
          ) : null}
        </div>
      </header>

      <LearnCatalogIsland modules={modules} />
    </div>
  )
}
