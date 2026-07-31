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

      {step === "heat" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Company room · Goldman Sachs
              </p>
              <h2 className="font-display mt-1 text-4xl tracking-tight">Topic heat</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Colour = firm heat intensity; hatch = your weak topics; number always visible.
                Glow reserved for the weakest cell only.
              </p>
            </div>
            <Warren
              mood="encouraging"
              aside="Evercore and GS over-index LBO — start there."
            />
          </div>

          <RoughFrame seedKey="mode-a-heat" torn>
            <TopicHeatmap
              firms={firms}
              topics={topics}
              cells={cells}
              compareMode
              onCellActivate={(cell) => {
                setFocusTopic(cell.topicLabel)
              }}
            />
            {weakest ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Focus glow target:{" "}
                <span className="font-medium text-[var(--error-foreground)]">
                  {weakest.topicLabel} @ {weakest.firmLabel}
                </span>{" "}
                (heat {weakest.intensity}, weak hatch)
              </p>
            ) : null}
          </RoughFrame>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setStep("rag")
              }}
            >
              Start pseudo-RAG · {focusTopic ?? "LBO"}
            </Button>
            <Link href="/mockups/mode-b">
              <Button variant="outline">Open related Learn module</Button>
            </Link>
          </div>
        </section>
      ) : null}

      {step === "rag" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <Warren
            mood="thinking"
            aside="Pack frozen at session start. Citations stay visible — Glassdoor never becomes the answer."
          />
          <RoughFrame seedKey="mode-a-rag-brief">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Session brief · AI grounded
            </p>
            <p className="mt-2 text-[15px] leading-relaxed">
              Superday prep for{" "}
              <Annotate type="underline" show>
                GS + MS + Evercore
              </Annotate>{" "}
              focusing on LBO mechanics. Retrieved from teaching corpus ranked by heat ∩ weakness.
            </p>
            <Annotate type="box" show>
              <span className="mt-3 inline-block font-mono text-xs">Pack size · 3 items frozen</span>
            </Annotate>
          </RoughFrame>

          <div className="grid gap-4">
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
            Open first card · layered study
          </Button>
        </section>
      ) : null}

      {step === "study" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Signature study · Mode A context
              </p>
              <h2 className="font-display mt-1 text-3xl tracking-tight">{citation.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Firm chip · GS · occurrence heat high · stage technical
              </p>
            </div>
            <Warren
              mood={scored ? "celebrating" : typing ? "paused" : "idle"}
              userFocused={typing}
              aside={
                scored
                  ? "Strong structure — underline the tax-shield phrase."
                  : typing
                    ? "Breathing paused while you write."
                    : "Reveal layers after you attempt — reactions are state-confirmed."
              }
            />
          </div>

          <RoughFrame seedKey="mode-a-question" torn>
            <p className="text-lg leading-relaxed">{citation.excerpt}</p>
            <label className="mt-4 block">
              <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Your answer
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[var(--radius-control)] border border-border bg-card p-3 text-sm outline-none focus:border-lime/50"
                value={answer}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Lead with structure, then numbers…"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={scored}
                onClick={() => {
                  setScored(true)
                  setRevealed(1)
                  setTyping(false)
                }}
              >
                Submit · score (confirmed)
              </Button>
              {scored ? (
                <Button
                  variant="outline"
                  onClick={() => setRevealed((v) => Math.min(4, v + 1))}
                >
                  Reveal next layer (r)
                </Button>
              ) : null}
            </div>
          </RoughFrame>

          {scored ? (
            <div className="space-y-4">
              {revealed >= 1 ? (
                <RoughFrame seedKey="layer-direct">
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">
                    1 · Direct answer
                  </p>
                  <p className="mt-2">
                    Walk sources & uses, then returns. Highlight:{" "}
                    <Annotate type="highlight" show>
                      tax shield on interest
                    </Annotate>
                    .
                  </p>
                </RoughFrame>
              ) : null}
              {revealed >= 2 ? (
                <RoughFrame seedKey="layer-diagram">
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">
                    4 · Interactive diagram slot
                  </p>
                  <div className="mt-3 rounded-[16px] border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                    {`Sources → Uses\n  Debt + Equity → Purchase equity + Refinance\n  ↓\n  Returns: MOIC / IRR intuition`}
                  </div>
                </RoughFrame>
              ) : null}
              {revealed >= 3 ? (
                <RoughFrame seedKey="layer-mistakes">
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">
                    7 · Common mistakes
                  </p>
                  <p className="mt-2">
                    <Annotate type="strike-through" show>
                      Skipping firm heat context in Mode A
                    </Annotate>
                  </p>
                </RoughFrame>
              ) : null}
              {revealed >= 4 ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setStep("done")}>Complete session</Button>
                  <span className="self-center font-mono text-[11px] text-[var(--milestone-foreground)]">
                    AI follow-up · cite pack item {citation.id}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "done" ? (
        <section className="space-y-6 animate-[settle-in_280ms_var(--ease-settle)]">
          <Warren mood="celebrating" aside="Mastery updated. Heat ∩ weakness refreshed." />
          <RoughFrame seedKey="mode-a-done">
            <p className="font-display text-3xl tracking-tight">
              Session complete ·{" "}
              <Annotate type="circle" show>
                3
              </Annotate>{" "}
              cards reviewed
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Next: Apply diagram checkpoint in Learn, or continue firm heat compare.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/mockups/mode-b">
                <Button>Continue to Learn journey</Button>
              </Link>
              <Button variant="outline" onClick={() => setStep("heat")}>
                Restart Mode A
              </Button>
            </div>
          </RoughFrame>
        </section>
      ) : null}
    </div>
  )
}
