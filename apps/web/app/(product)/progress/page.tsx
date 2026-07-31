import { ProgressIsland } from "@/components/progress-island"

export const metadata = {
  title: "Progress · Concord",
  description: "Firm readiness, module progress, accuracy, and study frequency",
}

export default function ProgressPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Roadmap / Progress
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Progress</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Readiness per target firm, Learn module completion, accuracy over time, and your study
          rhythm — computed from real attempts, never estimates.
        </p>
      </header>
      <ProgressIsland />
    </div>
  )
}
