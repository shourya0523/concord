import { DrillsIsland } from "@/components/drills-island"

export const metadata = {
  title: "Drills · Concord",
  description: "Seeded numeric drills — WACC, returns, EV bridge, LBO, accretion, UFCF and three statements",
}

export default function DrillsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Practice / Drills
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Numeric drills</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Unlimited interview-style calculations — WACC, MOIC and IRR, EV to equity, paper LBOs,
          accretion / dilution, free cash flow and the three statements. Numbers are checked by the
          finance calculators, never by a model, and every answer comes with the worked solution.
        </p>
      </header>
      <DrillsIsland />
    </div>
  )
}
