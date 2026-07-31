"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Annotate } from "@/components/mockups/annotate"
import { HandwritingHeadline } from "@/components/mockups/handwriting"
import { InterviewerAvatar } from "@/components/mockups/interviewer-avatar"
import { JourneyShell, NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { RoughHover } from "@/components/mockups/rough-hover"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["plan", "sim", "score", "recs"] as const
type Step = (typeof STEPS)[number]

const PLAN = [
  { id: "p1", kind: "Module", label: "LBO · diagram checkpoint", done: true },
  { id: "p2", kind: "Company", label: "GS heat drill · accounting", done: false, today: true },
  { id: "p3", kind: "Sim", label: "Firm mock · GS technical", done: false },
  { id: "p4", kind: "Module", label: "DCF module quiz", done: false },
]

const PAGE_META: Record<Step, { title: string; crumb: string }> = {
  plan: { title: "Study plan", crumb: "Interview in 12 days" },
  sim: { title: "Firm mock", crumb: "Plan / Simulator" },
  score: { title: "Score", crumb: "Plan / Simulator" },
  recs: { title: "Next up", crumb: "Plan" },
}

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
  const meta = PAGE_META[step]

  return (
    <JourneyShell
      pageTitle={meta.title}
      breadcrumb={meta.crumb}
      sections={[
        {
          title: "Plan",
          pages: [
            {
              id: "plan",
              label: "Roadmap",
              active: step === "plan",
              onSelect: () => setStep("plan"),
            },
            {
              id: "sim",
              label: "Simulator",
              active: step === "sim",
              onSelect: () => {
                setStep("sim")
                setInterviewerState("speaking")
                setScored(false)
                setAnswer("")
              },
            },
            {
              id: "score",
              label: "Score",
              active: step === "score",
              onSelect: () => {
                setScored(true)
                setStep("score")
              },
            },
            {
              id: "recs",
              label: "Next up",
              active: step === "recs",
              onSelect: () => setStep("recs"),
            },
          ],
        },
        {
          title: "Workspace",
          pages: [
            { id: "company", label: "Company", href: "/mockups/mode-a" },
            { id: "learn", label: "Learn", href: "/mockups/mode-b" },
          ],
        },
      ]}
    >
      {step === "plan" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Finish today&apos;s GS drill before the mock.
            </p>
          </NotionCallout>

          <ul className="divide-y divide-border rounded-md border border-border">
            {PLAN.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-3">
                <span
                  className={
                    item.today
                      ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-foreground"
                      : "mt-1.5 h-2 w-2 shrink-0 rounded-full border border-border"
                  }
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {item.kind}
                    {item.today ? " · today" : ""}
                  </p>
                  {item.done ? (
                    <Annotate type="crossed-off" show>
                      {item.label}
                    </Annotate>
                  ) : (
                    <p className="text-sm text-foreground">{item.label}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

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
        </div>
      ) : null}

      {step === "sim" ? (
        <div className="space-y-6">
          <InterviewerAvatar
            interviewerId="morgan-vp-gs"
            state={typing ? "listening" : interviewerState}
          />
          <PaperSheet seedKey="sim-question-sheet">
            <p className="text-lg font-medium leading-snug">
              Walk me through how depreciation flows through the three statements.
            </p>
            <textarea
              className="mt-4 min-h-36 w-full rounded-md border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground/30"
              value={answer}
              onFocus={() => {
                setTyping(true)
                setInterviewerState("listening")
              }}
              onBlur={() => setTyping(false)}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Structure first…"
            />
            <div className="mt-3">
              <RoughHover>
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
              </RoughHover>
            </div>
          </PaperSheet>
          <p className="text-xs text-muted-foreground">
            Warren stays out of the mock — the interviewer owns this surface.
          </p>
        </div>
      ) : null}

      {step === "score" ? (
        <div className="space-y-6">
          <PaperSheet seedKey="sim-score-sheet" hero>
            <HandwritingHeadline phrase="You scored 87%!" play={scored} />
            <p className="mt-4 text-5xl font-semibold tracking-tight">
              <Annotate type="circle" show={scored}>
                87
              </Annotate>
              <span className="text-2xl text-muted-foreground"> / 100</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed">
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
          </PaperSheet>
          <InterviewerAvatar interviewerId="morgan-vp-gs" state="evaluating" />
          <RoughHover>
            <Button onClick={() => setStep("recs")}>See next up</Button>
          </RoughHover>
        </div>
      ) : null}

      {step === "recs" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="celebrating" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">Nice work — here&apos;s what to drill next.</p>
          </NotionCallout>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className="underline-offset-2 hover:underline" href="/mockups/mode-b">
                Learn · Accounting Foundations
              </Link>
            </li>
            <li>
              <Link className="underline-offset-2 hover:underline" href="/mockups/mode-a">
                Company · GS heat · deferred tax
              </Link>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep("plan")}>Back to plan</Button>
            <Link href="/mockups">
              <Button variant="ghost">All pages</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </JourneyShell>
  )
}
