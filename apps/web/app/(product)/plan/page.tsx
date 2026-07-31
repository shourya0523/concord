import { StudyPlanIsland } from "@/components/study-plan-island"

export const metadata = {
  title: "Study plan · Concord",
  description: "Interview-date roadmap across company prep and learning modules",
}

export default function StudyPlanPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-muted-foreground">Plan / Interview roadmap</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Study plan</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A prerequisite-aware mix of company practice, module lessons, concept labs, and diagram
          checkpoints.
        </p>
      </header>
      <StudyPlanIsland />
    </div>
  )
}
