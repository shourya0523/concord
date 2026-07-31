"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Annotate } from "@/components/mockups/annotate"
import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { InterviewerAvatar } from "@/components/mockups/interviewer-avatar"
import { JourneyStepNav } from "@/components/mockups/journey-step-nav"
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

function prefersDelay() {
  if (typeof window === "undefined") return 0
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450
}

export function PlanSimJourney() {
  const [step, setStep] = React.useState<Step>("plan")
  const [interviewerState, setInterviewerState] = React.useState<
    "listening" | "speaking" | "evaluating"
  >("speaking")
  const [answer, setAnswer] = React.useState("")
  const [typing, setTyping] = React.useState(false)
  const [scored, setScored] = React.useState(false)

  return (
    <div className="space-y-10 font-sans">
      <JourneyStepNav
        steps={STEPS}
        step={step}
        onStep={(s) => {
          if (s === "score") setScored(true)
          setStep(s)
        }}
      />

      {step === "plan" ? (
        <section className="space-y-8">
          <div>
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Study plan · interview in 12 days
            </p>
            <h2 className="font-display mt-2 text-4xl tracking-tight">Roadmap</h2>
          </div>
          <Warren mood="encouraging" aside="Finish today's GS drill before the mock." />
          <RoughFrame seedKey="study-plan-path">
            <ol className="space-y-4">
              {PLAN.map((item) => (
                <li key={item.id} className="flex items-start gap-3 border-b border-border/60 pb-3">
                  <span
                    className={
                      item.today
                        ? "mt-1 inline-block h-2.5 w-2.5 rounded-full bg-foreground"
                        : "mt-1 inline-block h-2.5 w-2.5 rounded-full border border-border"
                    }
                    aria-hidden
                  />
                  <div>
                    <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
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
            Start firm mock
          </Button>
        </section>
      ) : null}

      {step === "sim" ? (
        <section className="space-y-8">
          <InterviewerAvatar
            interviewerId="morgan-vp-gs"
            state={typing ? "listening" : interviewerState}
          />
          <RoughFrame seedKey="sim-question">
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Accounting · technical
            </p>
            <p className="font-display mt-2 text-3xl tracking-tight">
              Walk me through how depreciation flows through the three statements.
            </p>
            <textarea
              className="mt-6 min-h-32 w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-foreground/40"
              value={answer}
              onFocus={() => {
                setTyping(true)
                setInterviewerState("listening")
              }}
              onBlur={() => setTyping(false)}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Structure first…"
            />
            <div className="mt-4">
              <Button
                onClick={() => {
                  setTyping(false)
                  setInterviewerState("evaluating")
                  window.setTimeout(() => {
                    setScored(true)
                    setStep("score")
                  }, prefersDelay())
                }}
              >
                Submit answer
              </Button>
            </div>
          </RoughFrame>
          <Warren
            mood="paused"
            userFocused={typing}
            aside="Warren stays out of the mock — the interviewer owns this surface."
          />
        </section>
      ) : null}

      {step === "score" ? (
        <section className="space-y-8">
          <div className="border border-border bg-card p-8 md:p-10">
            <HandwritingHeadline phrase="You scored 87%!" play={scored} />
            <p className="font-display mt-4 text-6xl tracking-tight">
              <Annotate type="circle" show={scored}>
                87
              </Annotate>
              <span className="text-3xl text-muted-foreground"> / 100</span>
            </p>
          </div>
          <RoughFrame seedKey="sim-feedback">
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Feedback
            </p>
            <p className="mt-2 text-base leading-relaxed">
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
          </RoughFrame>
          <InterviewerAvatar interviewerId="morgan-vp-gs" state="evaluating" />
          <Button onClick={() => setStep("recs")}>See recommendations</Button>
        </section>
      ) : null}

      {step === "recs" ? (
        <section className="space-y-8">
          <Warren mood="celebrating" aside="Nice work — here's what to drill next." />
          <div>
            <h2 className="font-display text-3xl tracking-tight">Next checkpoints</h2>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link className="underline-offset-4 hover:underline" href="/mockups/mode-b">
                  Learn · Accounting Foundations
                </Link>
              </li>
              <li>
                <Link className="underline-offset-4 hover:underline" href="/mockups/mode-a">
                  Company · GS heat · deferred tax
                </Link>
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setStep("plan")}>Back to plan</Button>
            <Link href="/mockups">
              <Button variant="outline">All journeys</Button>
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
