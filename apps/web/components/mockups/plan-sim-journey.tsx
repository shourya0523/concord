"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Annotate } from "@/components/mockups/annotate"
import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { InterviewerAvatar } from "@/components/mockups/interviewer-avatar"
import { RoughFrame } from "@/components/mockups/rough-frame"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["plan", "sim", "score", "recs"] as const
type Step = (typeof STEPS)[number]

const PLAN = [
  { id: "p1", kind: "module", label: "LBO module · diagram checkpoint", done: true },
  { id: "p2", kind: "company", label: "GS heat drill · accounting", done: false, today: true },
  { id: "p3", kind: "sim", label: "Firm-templated mock · GS technical", done: false },
  { id: "p4", kind: "module", label: "DCF module quiz", done: false },
]

export function PlanSimJourney() {
  const [step, setStep] = React.useState<Step>("plan")
  const [interviewerState, setInterviewerState] = React.useState<
    "listening" | "speaking" | "evaluating"
  >("speaking")
  const [answer, setAnswer] = React.useState("")
  const [typing, setTyping] = React.useState(false)
  const [scored, setScored] = React.useState(false)

  return (
    <div className="space-y-8">
      <ol className="flex flex-wrap gap-2 font-mono text-[11px] tracking-wide uppercase">
        {STEPS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => {
                if (s === "score") setScored(true)
                setStep(s)
              }}
              className={
                step === s
                  ? "rounded-full border border-lime/40 bg-accent px-3 py-1"
                  : "rounded-full border border-transparent px-3 py-1 text-muted-foreground hover:border-border"
              }
            >
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === "plan" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Study plan · interview in 12 days
              </p>
              <h2 className="font-display mt-1 text-4xl tracking-tight">
                Roadmap mix · Mode A + Learn
              </h2>
            </div>
            <Warren mood="encouraging" aside="Catch-up: finish today's GS drill before the mock." />
          </div>

          <RoughFrame seedKey="study-plan-path">
            <ol className="space-y-4">
              {PLAN.map((item) => (
                <li key={item.id} className="flex items-start gap-3 border-b border-border/60 pb-3">
                  <span
                    className={
                      item.today
                        ? "mt-0.5 inline-block h-3 w-3 rounded-full bg-lime"
                        : "mt-0.5 inline-block h-3 w-3 rounded-full border border-border"
                    }
                    aria-hidden
                  />
                  <div>
                    <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {item.kind}
                      {item.today ? " · today" : ""}
                    </p>
                    {item.done ? (
                      <Annotate type="crossed-off" show>
                        {item.label}
                      </Annotate>
                    ) : (
                      <p className="text-[15px]">{item.label}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </RoughFrame>

          <Button
            onClick={() => {
              setStep("sim")
              setInterviewerState("speaking")
              setScored(false)
              setAnswer("")
            }}
          >
            Start firm-templated simulator
          </Button>
        </section>
      ) : null}

      {step === "sim" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <InterviewerAvatar
            interviewerId="morgan-vp-gs"
            state={typing ? "listening" : interviewerState}
          />

          <RoughFrame seedKey="sim-question" torn>
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Stage · Accounting · timer calm
            </p>
            <p className="font-display mt-2 text-3xl tracking-tight">
              Walk me through how depreciation flows through the three statements.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Optional diagram prompt: sketch the IS → CFS → BS cash impact.
            </p>
            <textarea
              className="mt-4 min-h-32 w-full rounded-[var(--radius-control)] border border-border bg-card p-3 text-sm outline-none focus:border-lime/50"
              value={answer}
              onFocus={() => {
                setTyping(true)
                setInterviewerState("listening")
              }}
              onBlur={() => setTyping(false)}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Structure first…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setTyping(false)
                  setInterviewerState("evaluating")
                  // State-confirmed: score only after evaluate
                  window.setTimeout(() => {
                    setScored(true)
                    setStep("score")
                  }, prefersDelay())
                }}
              >
                Submit answer
              </Button>
              <Button
                variant="outline"
                onClick={() => setInterviewerState("speaking")}
              >
                Next stage prompt
              </Button>
            </div>
          </RoughFrame>

          <Warren
            mood="paused"
            userFocused={typing}
            aside="Warren stays out of the mock — interviewer cast owns this surface."
          />
        </section>
      ) : null}

      {step === "score" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="relative overflow-hidden rounded-[1.5rem] bg-card">
            {/* Decorative torn edges only — keep score type unfiltered/readable */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-card"
              style={{ filter: scored ? "url(#torn-paper-hero)" : undefined }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-card"
              style={{ filter: scored ? "url(#torn-paper-hero)" : undefined }}
            />
            <div className="relative p-6 md:p-10">
              <HandwritingHeadline phrase="You scored 87%!" play={scored} />
              <p className="font-display mt-4 text-6xl tracking-tight">
                <Annotate type="circle" show={scored}>
                  87
                </Annotate>
                <span className="text-3xl text-muted-foreground"> / 100</span>
              </p>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                Torn-paper on edges only — score type stays sharp. Number uses calm ease, never bounce.
              </p>
            </div>
          </div>

          <RoughFrame seedKey="sim-feedback">
            <p className="font-mono text-[11px] uppercase text-muted-foreground">Feedback</p>
            <p className="mt-2 text-[15px] leading-relaxed">
              Strong{" "}
              <Annotate type="highlight" show={scored}>
                cash add-back on the CFS
              </Annotate>
              . Watch{" "}
              <Annotate type="underline" show={scored}>
                deferred tax wording
              </Annotate>
              .
            </p>
            <Annotate type="bracket" show={scored}>
              <p className="mt-4 text-sm text-muted-foreground">
                Warren returns: drill three-statement module checkpoint next.
              </p>
            </Annotate>
          </RoughFrame>

          <InterviewerAvatar interviewerId="morgan-vp-gs" state="evaluating" />

          <Button onClick={() => setStep("recs")}>See recommendations</Button>
        </section>
      ) : null}

      {step === "recs" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <Warren mood="celebrating" aside="Paper-burst alternative: I celebrate with you." />
          <RoughFrame seedKey="recs">
            <p className="font-display text-3xl tracking-tight">Next checkpoints</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link className="underline-offset-4 hover:underline" href="/mockups/mode-b">
                  Learn · Accounting Foundations · diagram checkpoint
                </Link>
              </li>
              <li>
                <Link className="underline-offset-4 hover:underline" href="/mockups/mode-a">
                  Mode A · GS heat cell · deferred tax
                </Link>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setStep("plan")}>Back to plan</Button>
              <Link href="/mockups">
                <Button variant="outline">All journeys</Button>
              </Link>
            </div>
          </RoughFrame>
        </section>
      ) : null}
    </div>
  )
}

function prefersDelay() {
  if (typeof window === "undefined") return 0
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450
}
