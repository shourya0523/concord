import { StudyPlanIsland } from "@/components/study-plan-island"

export const metadata = {
  title: "Study plan · Concord",
  description: "Interview-date roadmap across company prep and learning modules",
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
          Company drills, module checkpoints, concept labs, and a mock slot — sequenced against
          your interview date, in prerequisite order.
        </p>
      </header>
      <StudyPlanIsland />
    </div>
  )
}
