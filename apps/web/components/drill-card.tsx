"use client"

/**
 * Numeric drill card (plan 2026-09-23-001 P2.8): prompt → typed number →
 * exact check against the seeded template answer.
 *
 * Foundation stub — the drills track implements the interaction.
 */
import type { DrillInstance } from "@ibpe/contracts"
import type { DrillAttemptResponse } from "@/lib/api/drill-schemas"

export function DrillCard({
  drill,
}: {
  drill: DrillInstance
  onGraded?: (result: DrillAttemptResponse) => void
}) {
  return (
    <section aria-label="Numeric drill" className="rounded-md border border-border p-4">
      <p className="text-sm">{drill.prompt}</p>
    </section>
  )
}
