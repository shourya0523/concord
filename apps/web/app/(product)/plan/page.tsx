import { StudyPlanIsland } from "@/components/study-plan-island"

export const metadata = {
  title: "Study plan · Concord",
  description:
    "Your interview prep roadmap — firm practice, modules, concept labs, and a mock interview, ordered by what to do next.",
}

export default function StudyPlanPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Roadmap
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Study plan</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Firm practice, module checkpoints, concept labs, and a mock interview —
          lined up in a sensible order. If you set an interview date, the plan
          paces the work against it.
        </p>
      </header>
      <StudyPlanIsland />
    </div>
  )
}
