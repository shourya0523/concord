"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { DiagramCanvas } from "@ibpe/ui/components/diagram-canvas"
import { ResourceLinkList } from "@ibpe/ui/components/resource-link-list"
import { CONCEPTS, DIAGRAM_SOURCES, FIRMS, resourcesForConcept } from "@/lib/mock-data"
import { Annotate } from "@/components/mockups/annotate"
import { RoughFrame } from "@/components/mockups/rough-frame"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["catalog", "hub", "lab", "quiz", "bridge"] as const
type Step = (typeof STEPS)[number]

const MODULES = [
  {
    id: "module_lbo_paper",
    slug: "lbo-and-paper-lbo",
    title: "LBO & Paper LBO",
    progress: 40,
    minutes: 55,
    domain: "PE",
  },
  {
    id: "module_dcf_wacc",
    slug: "dcf-and-wacc",
    title: "DCF & WACC",
    progress: 10,
    minutes: 50,
    domain: "IB",
  },
  {
    id: "module_accounting",
    slug: "accounting-foundations",
    title: "Accounting Foundations",
    progress: 100,
    minutes: 45,
    domain: "IB",
  },
]

const CHECKPOINTS = [
  { id: "c1", kind: "lesson", title: "Sources & uses intuition", done: true },
  { id: "c2", kind: "concept_lab", title: "Paper LBO diagram lab", done: false, current: true },
  { id: "c3", kind: "drill", title: "Returns drill", done: false },
  { id: "c4", kind: "quiz", title: "Module quiz", done: false },
]

export function ModeBJourney() {
  const [step, setStep] = React.useState<Step>("catalog")
  const [quizScore, setQuizScore] = React.useState<number | null>(null)
  const concept = CONCEPTS.find((c) => c.slug === "leveraged-buyouts") ?? CONCEPTS[0]!
  const diagram = DIAGRAM_SOURCES[concept.slug]
  const resources = resourcesForConcept(concept.id)
  const relatedFirms = FIRMS.filter((f) => (concept.firm_relevance[f.id] ?? 0) >= 0.7)

  return (
    <div className="space-y-8">
      <ol className="flex flex-wrap gap-2 font-mono text-[11px] tracking-wide uppercase">
        {STEPS.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(s)}
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

      {step === "catalog" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Learn · module catalog
              </p>
              <h2 className="font-display mt-1 text-4xl tracking-tight">Curriculum</h2>
            </div>
            <Warren
              mood="encouraging"
              aside="Recommended: LBO module — prereq ready + your weak PE heat."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setStep("hub")}
                className="text-left"
              >
                <RoughFrame seedKey={`catalog-${m.id}`} torn className="h-full">
                  <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                    {m.domain} · {m.minutes}m
                  </p>
                  <p className="font-display mt-2 text-2xl tracking-tight">{m.title}</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Progress{" "}
                    {m.progress >= 100 ? (
                      <Annotate type="circle" show>
                        {m.progress}%
                      </Annotate>
                    ) : (
                      <span className="font-mono">{m.progress}%</span>
                    )}
                  </p>
                </RoughFrame>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === "hub" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <h2 className="font-display text-4xl tracking-tight">LBO & Paper LBO</h2>
          <RoughFrame seedKey="module-roadmap">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Module roadmap
            </p>
            <ol className="mt-4 space-y-3">
              {CHECKPOINTS.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      c.current
                        ? "inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-lime text-[10px]"
                        : "inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground"
                    }
                  >
                    {c.done ? "✓" : c.kind[0]?.toUpperCase()}
                  </span>
                  {c.done ? (
                    <Annotate type="crossed-off" show>
                      {c.title}
                    </Annotate>
                  ) : (
                    <span className={c.current ? "font-medium" : "text-muted-foreground"}>
                      {c.title}
                      <span className="ml-2 font-mono text-[10px] uppercase">{c.kind}</span>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              Firm heat strip · BX / KKR over-index this module’s topics
            </p>
          </RoughFrame>
          <Button onClick={() => setStep("lab")}>Open concept lab · diagram</Button>
        </section>
      ) : null}

      {step === "lab" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Concept lab · parent module LBO
              </p>
              <h2 className="font-display mt-1 text-4xl tracking-tight">{concept.title}</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">{concept.summary}</p>
            </div>
            <Warren
              mood="thinking"
              aside="Pitfall: confusing MOIC intuition with IRR timing."
            />
          </div>

          <DiagramCanvas
            title={diagram?.title ?? "Paper LBO sketch"}
            source={diagram?.mermaid}
            fallback={
              <svg viewBox="0 0 520 160" className="h-auto w-full max-w-xl" role="img">
                <title>Sources and uses flow</title>
                <rect x="8" y="24" width="100" height="40" rx="6" fill="var(--accent)" stroke="var(--ink)" />
                <text x="58" y="48" textAnchor="middle" className="fill-foreground" style={{ fontSize: 12 }}>
                  Equity
                </text>
                <rect x="8" y="88" width="100" height="40" rx="6" fill="var(--accent)" stroke="var(--ink)" />
                <text x="58" y="112" textAnchor="middle" className="fill-foreground" style={{ fontSize: 12 }}>
                  Debt
                </text>
                <path d="M110 44 H160" stroke="var(--ink)" strokeWidth="1.5" markerEnd="url(#arrow)" />
                <path d="M110 108 H160" stroke="var(--ink)" strokeWidth="1.5" />
                <rect x="160" y="56" width="110" height="44" rx="6" fill="var(--card)" stroke="var(--ink)" />
                <text x="215" y="82" textAnchor="middle" className="fill-foreground" style={{ fontSize: 12 }}>
                  HoldCo
                </text>
                <path d="M270 78 H320" stroke="var(--ink)" strokeWidth="1.5" />
                <rect x="320" y="56" width="110" height="44" rx="6" fill="var(--card)" stroke="var(--ink)" />
                <text x="375" y="82" textAnchor="middle" className="fill-foreground" style={{ fontSize: 12 }}>
                  Target
                </text>
                <path d="M430 78 H470" stroke="var(--ink)" strokeWidth="1.5" />
                <rect x="470" y="56" width="42" height="44" rx="6" fill="var(--lime)" stroke="var(--ink)" />
                <text x="491" y="82" textAnchor="middle" className="fill-foreground" style={{ fontSize: 10 }}>
                  Uses
                </text>
              </svg>
            }
            reducedMotionFallback={
              <table className="w-full text-left text-sm">
                <caption className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">
                  A11y fallback
                </caption>
                <tbody>
                  <tr>
                    <th className="border-b border-border py-1 pr-3">Sources</th>
                    <td className="border-b border-border py-1">Debt + Equity</td>
                  </tr>
                  <tr>
                    <th className="border-b border-border py-1 pr-3">Uses</th>
                    <td className="border-b border-border py-1">Purchase equity + fees</td>
                  </tr>
                  <tr>
                    <th className="py-1 pr-3">Returns</th>
                    <td className="py-1">MOIC / IRR</td>
                  </tr>
                </tbody>
              </table>
            }
          />

          <RoughFrame seedKey="lab-notes">
            <p className="font-mono text-[11px] uppercase text-muted-foreground">Lab notes</p>
            <p className="mt-2 text-[15px] leading-relaxed">
              Keep the{" "}
              <Annotate type="box" show>
                MOIC = Exit equity / Entry equity
              </Annotate>{" "}
              definition isolated before timing IRR.
            </p>
          </RoughFrame>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase text-muted-foreground">
                Where this shows up
              </p>
              <ul className="flex flex-wrap gap-2">
                {relatedFirms.map((f) => (
                  <li key={f.id}>
                    <span className="rounded-full border border-border px-3 py-1 text-xs">
                      {f.name} · {((concept.firm_relevance[f.id] ?? 0) * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <ResourceLinkList resources={resources} title="Resources" />
          </div>

          <Button onClick={() => setStep("quiz")}>Module quiz checkpoint</Button>
        </section>
      ) : null}

      {step === "quiz" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <RoughFrame seedKey="module-quiz">
            <p className="font-mono text-[11px] uppercase text-muted-foreground">Module quiz</p>
            <p className="mt-2 text-lg">If MOIC is 2.0x over 5 years, IRR is closest to?</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["~15%", "~20%", "~25%"].map((opt) => (
                <Button
                  key={opt}
                  variant="outline"
                  onClick={() => {
                    setQuizScore(opt === "~15%" ? 100 : 40)
                    setStep("bridge")
                  }}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </RoughFrame>
        </section>
      ) : null}

      {step === "bridge" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <Warren
            mood={quizScore && quizScore >= 80 ? "celebrating" : "concerned"}
            aside="Bridge into Mode A — apply this concept at Blackstone heat cells."
          />
          <RoughFrame seedKey="quiz-score" className="[filter:url(#torn-paper-static)]">
            <p className="font-display text-4xl tracking-tight">
              Quiz score{" "}
              <Annotate type="circle" show={quizScore != null}>
                {quizScore ?? 0}%
              </Annotate>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Calm number motion only — no bounce on scores.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/companies/${relatedFirms[0]?.slug ?? "blackstone"}`}>
                <Button>Apply at {relatedFirms[0]?.aliases[0] ?? "BX"}</Button>
              </Link>
              <Link href="/mockups/mode-a">
                <Button variant="outline">Open Mode A mockup</Button>
              </Link>
              <Link href="/mockups/plan-sim">
                <Button variant="outline">Plan → Simulator journey</Button>
              </Link>
            </div>
          </RoughFrame>
        </section>
      ) : null}
    </div>
  )
}
