"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { DiagramCanvas } from "@ibpe/ui/components/diagram-canvas"
import { ResourceLinkList } from "@ibpe/ui/components/resource-link-list"
import { CONCEPTS, DIAGRAM_SOURCES, FIRMS, resourcesForConcept } from "@/lib/mock-data"
import { Annotate } from "@/components/mockups/annotate"
import { JourneyShell, NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { RoughHover } from "@/components/mockups/rough-hover"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["catalog", "hub", "lab", "quiz", "bridge"] as const
type Step = (typeof STEPS)[number]

const MODULES = [
  { id: "module_lbo_paper", title: "LBO & Paper LBO", progress: 40, minutes: 55, domain: "PE" },
  { id: "module_dcf_wacc", title: "DCF & WACC", progress: 10, minutes: 50, domain: "IB" },
  {
    id: "module_accounting",
    title: "Accounting Foundations",
    progress: 100,
    minutes: 45,
    domain: "IB",
  },
]

const CHECKPOINTS = [
  { id: "c1", title: "Sources & uses intuition", done: true },
  { id: "c2", title: "Paper LBO diagram lab", done: false, current: true },
  { id: "c3", title: "Returns drill", done: false },
  { id: "c4", title: "Module quiz", done: false },
]

const PAGE_META: Record<Step, { title: string; crumb: string }> = {
  catalog: { title: "Learn", crumb: "Modules" },
  hub: { title: "LBO & Paper LBO", crumb: "Learn" },
  lab: { title: "Paper LBO lab", crumb: "Learn / LBO & Paper LBO" },
  quiz: { title: "Module quiz", crumb: "Learn / LBO & Paper LBO" },
  bridge: { title: "Apply at a firm", crumb: "Learn / LBO & Paper LBO" },
}

export function ModeBJourney() {
  const [step, setStep] = React.useState<Step>("catalog")
  const [quizScore, setQuizScore] = React.useState<number | null>(null)
  const concept = CONCEPTS.find((c) => c.slug === "leveraged-buyouts") ?? CONCEPTS[0]!
  const diagram = DIAGRAM_SOURCES[concept.slug]
  const resources = resourcesForConcept(concept.id)
  const relatedFirms = FIRMS.filter((f) => (concept.firm_relevance[f.id] ?? 0) >= 0.7)
  const meta = PAGE_META[step]

  return (
    <JourneyShell
      pageTitle={meta.title}
      breadcrumb={meta.crumb}
      sections={[
        {
          title: "Learn",
          pages: [
            {
              id: "catalog",
              label: "Modules",
              active: step === "catalog",
              onSelect: () => setStep("catalog"),
            },
            {
              id: "hub",
              label: "LBO module",
              active: step === "hub",
              onSelect: () => setStep("hub"),
            },
            {
              id: "lab",
              label: "Diagram lab",
              active: step === "lab",
              onSelect: () => setStep("lab"),
            },
            {
              id: "quiz",
              label: "Quiz",
              active: step === "quiz",
              onSelect: () => setStep("quiz"),
            },
            {
              id: "bridge",
              label: "Apply at firm",
              active: step === "bridge",
              onSelect: () => setStep("bridge"),
            },
          ],
        },
        {
          title: "Workspace",
          pages: [
            { id: "company", label: "Company", href: "/mockups/mode-a" },
            { id: "plan", label: "Plan", href: "/mockups/plan-sim" },
          ],
        },
      ]}
    >
      {step === "catalog" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Recommended: LBO module — prereq ready + your weak PE heat.
            </p>
          </NotionCallout>

          <ul className="divide-y divide-border rounded-md border border-border">
            {MODULES.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setStep("hub")}
                  className="flex w-full items-baseline justify-between gap-4 px-3 py-3 text-left hover:bg-black/[0.03]"
                >
                  <span>
                    <span className="block text-sm font-medium text-foreground">{m.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {m.domain} · {m.minutes}m
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{m.progress}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === "hub" ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Roadmap through lessons, lab, drill, and quiz.
          </p>
          <ol className="space-y-1">
            {CHECKPOINTS.map((c) => (
              <li
                key={c.id}
                className={
                  c.current
                    ? "rounded-md bg-black/[0.04] px-3 py-2 text-sm font-medium"
                    : "px-3 py-2 text-sm text-muted-foreground"
                }
              >
                {c.done ? (
                  <Annotate type="crossed-off" show>
                    {c.title}
                  </Annotate>
                ) : (
                  c.title
                )}
                {c.current ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">current</span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Shows up at{" "}
            {relatedFirms
              .slice(0, 2)
              .map((f) => f.aliases[0] ?? f.name)
              .join(", ")}
          </p>
          <Button onClick={() => setStep("lab")}>Open diagram lab</Button>
        </div>
      ) : null}

      {step === "lab" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="thinking" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Pitfall: confusing MOIC intuition with IRR timing.
            </p>
          </NotionCallout>

          <PaperSheet seedKey="learn-lab-diagram">
            <DiagramCanvas
              title={diagram?.title ?? "Paper LBO sketch"}
              source={diagram?.mermaid}
              fallback={
                <svg viewBox="0 0 520 140" className="h-auto w-full max-w-lg" role="img">
                  <title>Sources and uses</title>
                  <rect x="8" y="40" width="90" height="36" rx="4" fill="oklch(0.94 0.016 88)" stroke="var(--ink)" />
                  <text x="53" y="62" textAnchor="middle" style={{ fontSize: 12 }} fill="var(--ink)">
                    Equity
                  </text>
                  <rect x="8" y="88" width="90" height="36" rx="4" fill="oklch(0.94 0.016 88)" stroke="var(--ink)" />
                  <text x="53" y="110" textAnchor="middle" style={{ fontSize: 12 }} fill="var(--ink)">
                    Debt
                  </text>
                  <path d="M98 58 H150 M98 106 H150" stroke="var(--ink)" strokeWidth="1.2" />
                  <rect x="150" y="64" width="100" height="36" rx="4" fill="oklch(0.975 0.014 88)" stroke="var(--ink)" />
                  <text x="200" y="86" textAnchor="middle" style={{ fontSize: 12 }} fill="var(--ink)">
                    HoldCo
                  </text>
                  <path d="M250 82 H300" stroke="var(--ink)" strokeWidth="1.2" />
                  <rect x="300" y="64" width="100" height="36" rx="4" fill="oklch(0.975 0.014 88)" stroke="var(--ink)" />
                  <text x="350" y="86" textAnchor="middle" style={{ fontSize: 12 }} fill="var(--ink)">
                    Target
                  </text>
                  <path d="M400 82 H450" stroke="var(--ink)" strokeWidth="1.2" />
                  <rect x="450" y="64" width="60" height="36" rx="4" fill="oklch(0.94 0.016 88)" stroke="var(--ink)" />
                  <text x="480" y="86" textAnchor="middle" style={{ fontSize: 11 }} fill="var(--ink)">
                    Uses
                  </text>
                </svg>
              }
            />
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">Lab note</p>
              <p className="mt-1 text-sm leading-relaxed">
                Keep{" "}
                <Annotate type="box" show>
                  MOIC = Exit equity / Entry equity
                </Annotate>{" "}
                separate from IRR timing.
              </p>
            </div>
          </PaperSheet>

          <ResourceLinkList resources={resources} title="Resources" />
          <RoughHover>
            <Button onClick={() => setStep("quiz")}>Module quiz</Button>
          </RoughHover>
        </div>
      ) : null}

      {step === "quiz" ? (
        <div className="space-y-6">
          <p className="text-sm font-medium">
            If MOIC is 2.0× over 5 years, IRR is closest to?
          </p>
          <div className="flex flex-col gap-2">
            {["~15%", "~20%", "~25%"].map((opt) => (
              <button
                key={opt}
                type="button"
                className="rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                onClick={() => {
                  setQuizScore(opt === "~15%" ? 100 : 0)
                  setStep("bridge")
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "bridge" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Bridge into Mode A — apply this at Blackstone heat cells.
            </p>
          </NotionCallout>
          {quizScore !== null ? (
            <p className="text-sm text-muted-foreground">
              Quiz score{" "}
              <Annotate type="circle" show>
                {quizScore}%
              </Annotate>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/mockups/mode-a">
              <Button>Open Company heat</Button>
            </Link>
            <Link href="/mockups/plan-sim">
              <Button variant="ghost">Plan</Button>
            </Link>
          </div>
        </div>
      ) : null}
    </JourneyShell>
  )
}
