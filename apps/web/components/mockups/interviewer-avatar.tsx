"use client"

import * as React from "react"
import { createAvatar } from "@dicebear/core"
import { adventurer } from "@dicebear/collection"

import { cn } from "@ibpe/ui/lib/utils"

/** Fixed interviewer cast — never regenerate seeds per session. */
export const INTERVIEWERS = {
  "morgan-vp-gs": {
    seed: "morgan-vp-gs",
    name: "Morgan Chen",
    title: "VP, Investment Banking",
    firm: "Goldman Sachs",
  },
  "alex-pe-kkr": {
    seed: "alex-pe-kkr",
    name: "Alex Rivera",
    title: "PE Associate",
    firm: "KKR",
  },
  "jordan-analyst-jpm": {
    seed: "jordan-analyst-jpm",
    name: "Jordan Blake",
    title: "Analyst",
    firm: "J.P. Morgan",
  },
  "taylor-associate-blackstone": {
    seed: "taylor-associate-blackstone",
    name: "Taylor Quinn",
    title: "PE Associate",
    firm: "Blackstone",
  },
  "casey-md-evercore": {
    seed: "casey-md-evercore",
    name: "Casey Landau",
    title: "Managing Director",
    firm: "Evercore",
  },
} as const

export type InterviewerId = keyof typeof INTERVIEWERS
export type InterviewerState = "listening" | "speaking" | "evaluating"

type Props = {
  interviewerId: InterviewerId
  state?: InterviewerState
  className?: string
  size?: number
  showMeta?: boolean
}

export function InterviewerAvatar({
  interviewerId,
  state = "listening",
  className,
  size = 72,
  showMeta = true,
}: Props) {
  const persona = INTERVIEWERS[interviewerId]
  const svg = React.useMemo(
    () =>
      createAvatar(adventurer, {
        seed: persona.seed,
        size,
        backgroundColor: ["f5f2ea"],
      }).toString(),
    [persona.seed, size],
  )

  return (
    <div className={cn("flex items-center gap-3", className)} data-interviewer-state={state}>
      <div
        className={cn(
          "overflow-hidden rounded-full border border-border bg-muted",
          state === "speaking" && "ring-2 ring-lime/50",
          state === "evaluating" && "opacity-90",
        )}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-hidden
      />
      {showMeta ? (
        <div>
          <p className="font-display text-xl tracking-tight text-foreground">{persona.name}</p>
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {persona.title} · {persona.firm}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state === "listening" && "Listening"}
            {state === "speaking" && "Speaking"}
            {state === "evaluating" && "Evaluating"}
          </p>
        </div>
      ) : null}
    </div>
  )
}
