"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import {
  TargetSelectIsland,
  writeStoredTargets,
  readStoredTargets,
} from "@/components/target-select-island"

type LearningMode = "company_prep" | "concept_learn"

export function OnboardingForm() {
  const router = useRouter()
  const [modes, setModes] = React.useState<LearningMode[]>(["company_prep", "concept_learn"])
  const [targets, setTargets] = React.useState<string[]>([])
  const [role, setRole] = React.useState("Investment Banking Analyst")
  const [interviewDate, setInterviewDate] = React.useState("")

  React.useEffect(() => {
    setTargets(readStoredTargets())
  }, [])

  function toggleMode(mode: LearningMode) {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
  }

  function finish(event: React.FormEvent) {
    event.preventDefault()
    if (targets.length) writeStoredTargets(targets)
    window.localStorage.setItem(
      "ibpe.onboarding",
      JSON.stringify({ modes, role, interviewDate, targets })
    )
    router.push("/dashboard")
  }

  return (
    <form onSubmit={finish} className="mx-auto max-w-xl space-y-8">
      <fieldset className="space-y-3">
        <legend className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Learning modes
        </legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["company_prep", "Company prep"],
              ["concept_learn", "Concept lab"],
            ] as const
          ).map(([id, label]) => {
            const on = modes.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleMode(id)}
                className={
                  on
                    ? "rounded-full border border-lime/50 bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                    : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
                }
                aria-pressed={on}
              >
                {label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label>Target companies</Label>
        <TargetSelectIsland value={targets} onChange={setTargets} />
        <p className="text-xs text-muted-foreground">
          Multi-select persists for heat compare and pseudo-RAG prep.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="interview">Interview date</Label>
        <Input
          id="interview"
          type="date"
          value={interviewDate}
          onChange={(e) => setInterviewDate(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Enter terminal</Button>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Skip for now
        </Link>
        <MetadataPill tone="lime">Mode A + B</MetadataPill>
      </div>
    </form>
  )
}
