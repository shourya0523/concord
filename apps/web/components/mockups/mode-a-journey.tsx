"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { TopicHeatmap } from "@ibpe/ui/components/topic-heatmap"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"
import {
  FIRMS,
  RAG_CITATIONS,
  TOPIC_HEAT,
  TOPICS,
  WEAK_TOPICS,
  intensityToHeatLevel,
} from "@/lib/mock-data"
import { Annotate } from "@/components/mockups/annotate"
import { RoughFrame } from "@/components/mockups/rough-frame"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["heat", "rag", "study", "done"] as const
type Step = (typeof STEPS)[number]

function StepNav({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  return (
    <ol className="flex gap-4 font-sans text-sm text-muted-foreground">
      {STEPS.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => setStep(s)}
            className={
              step === s
                ? "font-medium text-foreground underline decoration-2 underline-offset-8"
                : "hover:text-foreground"
            }
          >
            {s}
          </button>
        </li>
      ))}
    </ol>
  )
}

export function ModeAJourney() {
  const [step, setStep] = React.useState<Step>("heat")
  const [focusTopic, setFocusTopic] = React.useState<string | null>("LBO")
  const [revealed, setRevealed] = React.useState(0)
  const [scored, setScored] = React.useState(false)
  const [typing, setTyping] = React.useState(false)
  const [answer, setAnswer] = React.useState("")

  const firms = FIRMS.filter((f) => ["firm_gs", "firm_ms", "firm_ev"].includes(f.id)).map(
    (f) => ({ id: f.id, label: f.aliases[0] ?? f.name }),
  )
  const topics = TOPICS.slice(0, 6)
  const cells = TOPIC_HEAT.filter((h) => firms.some((f) => f.id === h.firm_id)).map((h) => ({
    firmId: h.firm_id,
    firmLabel: firms.find((f) => f.id === h.firm_id)?.label ?? h.firm_id,
    topicId: h.topic_id,
    topicLabel: topics.find((t) => t.id === h.topic_id)?.label ?? h.topic_id,
    intensity: intensityToHeatLevel(h.intensity),
    weak: WEAK_TOPICS.some((w) => w.id === h.topic_id),
    count: h.sample_size,
  }))
  const weakest = cells
    .filter((c) => c.weak)
    .sort((a, b) => b.intensity - a.intensity)[0]

  const citation = RAG_CITATIONS[0]!

  return (
    <div className="space-y-10 font-sans">
      <StepNav step={step} setStep={setStep} />

      {step === "heat" ? (
        <section className="space-y-8">
          <div>
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Goldman Sachs · company room
            </p>
            <h2 className="font-display mt-2 text-4xl tracking-tight">Topic heat</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Colour = firm heat. Hatch = your weak topics. Numbers always readable.
            </p>
          </div>

          <Warren mood="encouraging" aside="GS and Evercore over-index LBO — start there." />

          <RoughFrame seedKey="mode-a-heat">
            <TopicHeatmap
              firms={firms}
              topics={topics}
              cells={cells}
              compareMode
              onCellActivate={(cell) => setFocusTopic(cell.topicLabel)}
            />
            {weakest ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Weakest overlap:{" "}
                <span className="font-medium text-foreground">
                  {weakest.topicLabel} @ {weakest.firmLabel}
                </span>
              </p>
            ) : null}
          </RoughFrame>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setStep("rag")}>
              Start pack · {focusTopic ?? "LBO"}
            </Button>
            <Link href="/mockups/mode-b">
              <Button variant="outline">Related Learn module</Button>
            </Link>
          </div>
        </section>
      ) : null}

      {step === "rag" ? (
        <section className="space-y-8">
          <div>
            <h2 className="font-display text-4xl tracking-tight">Session pack</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Frozen at start. Citations stay visible — Glassdoor never becomes the answer.
            </p>
          </div>

          <Warren
            mood="thinking"
            aside="Ranked by heat ∩ weakness from the teaching corpus."
          />

          <RoughFrame seedKey="mode-a-rag-brief">
            <p className="text-base leading-relaxed">
              Superday prep for{" "}
              <Annotate type="underline" show>
                GS + MS + Evercore
              </Annotate>
              , focusing on LBO mechanics.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              <Annotate type="box" show>
                Pack · 3 items frozen
              </Annotate>
            </p>
          </RoughFrame>

          <div className="space-y-3">
            {RAG_CITATIONS.slice(0, 3).map((item) => (
              <PseudoRagCitationCard
                key={item.id}
                title={item.title}
                excerpt={item.excerpt}
                whyRetrieved={item.whyRetrieved}
                provenance={item.provenance}
                score={item.score}
              />
            ))}
          </div>

          <Button
            onClick={() => {
              setStep("study")
              setRevealed(0)
              setScored(false)
            }}
          >
            Open layered study
          </Button>
        </section>
      ) : null}

      {step === "study" ? (
        <section className="space-y-8">
          <div>
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              Study · GS · technical
            </p>
            <h2 className="font-display mt-2 text-4xl tracking-tight">{citation.title}</h2>
          </div>

          <RoughFrame seedKey="mode-a-question">
            <p className="text-base leading-relaxed text-foreground">{citation.excerpt}</p>
            <label className="mt-6 block">
              <span className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                Your answer
              </span>
              <textarea
                className="mt-2 min-h-32 w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                value={answer}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Lead with structure, then numbers…"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={scored}
                onClick={() => {
                  setScored(true)
                  setRevealed(1)
                  setTyping(false)
                }}
              >
                Submit
              </Button>
              {scored ? (
                <Button variant="outline" onClick={() => setRevealed((v) => Math.min(4, v + 1))}>
                  Reveal next layer
                </Button>
              ) : null}
            </div>
          </RoughFrame>

          <Warren
            mood={scored ? "celebrating" : typing ? "paused" : "idle"}
            userFocused={typing}
            aside={
              scored
                ? "Strong structure — underline the tax-shield phrase."
                : typing
                  ? "I'll wait while you write."
                  : "Attempt first. Layers unlock after you submit."
            }
          />

          {scored ? (
            <div className="space-y-4 border-t border-border/80 pt-8">
              {revealed >= 1 ? (
                <div>
                  <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                    Direct answer
                  </p>
                  <p className="mt-2 text-base leading-relaxed">
                    Walk sources & uses, then returns. Key phrase:{" "}
                    <Annotate type="highlight" show>
                      tax shield on interest
                    </Annotate>
                    .
                  </p>
                </div>
              ) : null}
              {revealed >= 2 ? (
                <div>
                  <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                    Diagram
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Sources (debt + equity) → Uses (purchase equity + refinance) → Returns (MOIC /
                    IRR).
                  </p>
                </div>
              ) : null}
              {revealed >= 3 ? (
                <div>
                  <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                    Common mistake
                  </p>
                  <p className="mt-2 text-base">
                    <Annotate type="strike-through" show>
                      Skipping firm heat context in Mode A
                    </Annotate>
                  </p>
                </div>
              ) : null}
              {revealed >= 4 ? (
                <Button onClick={() => setStep("done")}>Complete session</Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "done" ? (
        <section className="space-y-8">
          <Warren mood="celebrating" aside="Mastery updated. Heat ∩ weakness refreshed." />
          <div>
            <h2 className="font-display text-4xl tracking-tight">
              Session complete ·{" "}
              <Annotate type="circle" show>
                3
              </Annotate>{" "}
              cards
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Next: diagram checkpoint in Learn, or keep comparing firm heat.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/mockups/mode-b">
              <Button>Continue to Learn</Button>
            </Link>
            <Button variant="outline" onClick={() => setStep("heat")}>
              Restart
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
