import { SimulatorIsland } from "@/components/simulator-island"

export const metadata = {
  title: "Interview simulator · Concord",
  description: "Firm-templated mock interview with a deterministic interviewer cast",
}

export default function SimulatorPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Roadmap / Simulator
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">
          Interview simulator
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A firm-templated mock: four timed stages, a fixed interviewer, and honest self-ratings
          that feed your mastery record.
        </p>
      </header>
      <SimulatorIsland />
    </div>
  )
}
