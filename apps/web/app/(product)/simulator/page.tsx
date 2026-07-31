import { SimulatorIsland } from "@/components/simulator-island"

export const metadata = {
  title: "Interview simulator · IBPE",
  description: "Firm-configurable interview simulation shell",
}

export default function SimulatorPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-muted-foreground">Plan / Simulator</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          Interview simulator
        </h1>
      </header>
      <p className="max-w-2xl text-[15px] text-muted-foreground">
        Configure firm flavour from your saved targets, answer a published teaching-corpus
        question, then persist the transcript and self-rating to your mastery record.
      </p>
      <SimulatorIsland />
    </div>
  )
}
