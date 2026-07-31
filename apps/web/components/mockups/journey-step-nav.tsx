"use client"

import { cn } from "@ibpe/ui/lib/utils"

export function JourneyStepNav<T extends string>({
  steps,
  step,
  onStep,
}: {
  steps: readonly T[]
  step: T
  onStep: (s: T) => void
}) {
  return (
    <ol className="flex flex-wrap gap-4 font-sans text-sm text-muted-foreground">
      {steps.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => onStep(s)}
            className={cn(
              step === s
                ? "font-medium text-foreground underline decoration-2 underline-offset-8"
                : "hover:text-foreground",
            )}
          >
            {s}
          </button>
        </li>
      ))}
    </ol>
  )
}
