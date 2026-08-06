import { LearnCatalogIsland } from "@/components/learn-catalog-island"
import { listLearningModules } from "@/lib/data/learning"

export const metadata = {
  title: "Learn modules · Concord",
  description:
    "IB and PE learning modules — lessons, diagrams, drills, and quizzes in a sensible order.",
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
          Learn · modules
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          Learn
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Modules teach the finance in order — lessons, diagram labs, practice
          drills, and quizzes. When a topic shows up often at your target firms,
          you can jump from here into Company prep.
        </p>
        {result.note ? (
          <p className="mt-3 text-xs text-muted-foreground">{result.note}</p>
        ) : null}
      </header>

      <LearnCatalogIsland modules={modules} />
    </div>
  )
}
