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
import { JourneyShell, NotionCallout } from "@/components/mockups/journey-shell"
import { PaperSheet } from "@/components/mockups/paper-sheet"
import { InkHoverScope, RoughHover } from "@/components/mockups/rough-hover"
import { Warren } from "@/components/mockups/warren"

const STEPS = ["heat", "pack", "study", "done"] as const
type Step = (typeof STEPS)[number]

const PAGE_META: Record<Step, { title: string; crumb: string }> = {
  heat: { title: "Topic heat", crumb: "Goldman Sachs" },
  pack: { title: "Session pack", crumb: "Goldman Sachs / Prep" },
  study: { title: "Walk me through an LBO", crumb: "Goldman Sachs / Study" },
  done: { title: "Session complete", crumb: "Goldman Sachs" },
}

export function ModeAJourney() {
  const [step, setStep] = React.useState<Step>("heat")
  const [focusTopic, setFocusTopic] = React.useState<string | null>("LBO")
  const [revealed, setRevealed] = React.useState(0)
  const [scored, setScored] = React.useState(false)
  const [typing, setTyping] = React.useState(false)
  const [answer, setAnswer] = React.useState("")

  const firms = FIRMS.filter((f) => ["firm_goldman-sachs", "firm_morgan-stanley", "firm_evercore"].includes(f.id)).map(
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
  const meta = PAGE_META[step]

  return (
    <JourneyShell
      pageTitle={meta.title}
      breadcrumb={meta.crumb}
      sections={[
        {
          title: "Company",
          pages: [
            {
              id: "heat",
              label: "Topic heat",
              active: step === "heat",
              onSelect: () => setStep("heat"),
            },
            {
              id: "pack",
              label: "Session pack",
              active: step === "pack",
              onSelect: () => setStep("pack"),
            },
            {
              id: "study",
              label: "Study",
              active: step === "study",
              onSelect: () => {
                setStep("study")
                setRevealed(0)
                setScored(false)
              },
            },
            {
              id: "done",
              label: "Done",
              active: step === "done",
              onSelect: () => setStep("done"),
            },
          ],
        },
        {
          title: "Workspace",
          pages: [
            { id: "learn", label: "Learn", href: "/mockups/mode-b" },
            { id: "plan", label: "Plan", href: "/mockups/plan-sim" },
          ],
        },
      ]}
    >
      {step === "heat" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="encouraging" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              GS and Evercore over-index LBO — start there.
            </p>
          </NotionCallout>

          <p className="text-sm text-muted-foreground">
            Colour = firm heat. Hatch = your weak topics. Numbers stay visible. Hover draws a box —
            no glow.
          </p>

          <PaperSheet seedKey="mode-a-heat-sheet">
            <InkHoverScope>
              <TopicHeatmap
                firms={firms}
                topics={topics}
                cells={cells}
                compareMode
                onCellActivate={(cell) => setFocusTopic(cell.topicLabel)}
              />
            </InkHoverScope>
            {weakest ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Weakest overlap:{" "}
                <span className="font-medium text-foreground">
                  {weakest.topicLabel} @ {weakest.firmLabel}
                </span>
              </p>
            ) : null}
          </PaperSheet>

          <div className="flex flex-wrap gap-2 pt-2">
            <RoughHover>
              <Button onClick={() => setStep("pack")}>Open pack · {focusTopic ?? "LBO"}</Button>
            </RoughHover>
            <Link href="/mockups/mode-b">
              <Button variant="ghost">Related module</Button>
            </Link>
          </div>
        </div>
      ) : null}

      {step === "pack" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="thinking" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Pack frozen at session start. Citations stay visible — Glassdoor never becomes the
              answer.
            </p>
          </NotionCallout>

          <p className="text-sm leading-relaxed text-foreground">
            Superday prep for{" "}
            <Annotate type="underline" show>
              GS + MS + Evercore
            </Annotate>
            , focusing on LBO. Ranked by heat ∩ weakness.
          </p>
          <p className="text-sm text-muted-foreground">
            <Annotate type="box" show>
              3 items frozen
            </Annotate>
          </p>

          <PaperSheet seedKey="mode-a-pack" torn={false}>
            <div className="space-y-2">
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
          </PaperSheet>

          <RoughHover>
            <Button
              onClick={() => {
                setStep("study")
                setRevealed(0)
                setScored(false)
              }}
            >
              Start study
            </Button>
          </RoughHover>
        </div>
      ) : null}

      {step === "study" ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{citation.excerpt}</p>

          <PaperSheet seedKey="mode-a-study-answer">
            <label className="text-xs font-medium text-muted-foreground">Your answer</label>
            <textarea
              className="mt-2 min-h-36 w-full rounded-md border border-border bg-transparent p-3 text-sm leading-relaxed outline-none focus:border-foreground/30"
              value={answer}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Lead with structure, then numbers…"
            />
            <div className="mt-3">
              <RoughHover>
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
              </RoughHover>
              {scored ? (
                <Button
                  variant="ghost"
                  className="ml-2"
                  onClick={() => setRevealed((v) => Math.min(4, v + 1))}
                >
                  Reveal next
                </Button>
              ) : null}
            </div>
          </PaperSheet>

          <NotionCallout
            warren={
              <Warren
                mood={scored ? "celebrating" : typing ? "paused" : "idle"}
                userFocused={typing}
                size={48}
              />
            }
          >
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              {scored
                ? "Strong structure — underline the tax-shield phrase."
                : typing
                  ? "I'll wait while you write."
                  : "Attempt first. Layers unlock after you submit."}
            </p>
          </NotionCallout>

          {scored && revealed >= 1 ? (
            <div className="space-y-4 border-t border-border pt-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Direct answer</p>
                <p className="mt-1 text-sm leading-relaxed">
                  Walk sources & uses, then returns. Key:{" "}
                  <Annotate type="highlight" show>
                    tax shield on interest
                  </Annotate>
                  .
                </p>
              </div>
              {revealed >= 2 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Diagram</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sources (debt + equity) → Uses → Returns (MOIC / IRR).
                  </p>
                </div>
              ) : null}
              {revealed >= 3 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Common mistake</p>
                  <p className="mt-1 text-sm">
                    <Annotate type="strike-through" show>
                      Skipping firm heat context
                    </Annotate>
                  </p>
                </div>
              ) : null}
              {revealed >= 4 ? (
                <Button onClick={() => setStep("done")}>Complete session</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-6">
          <NotionCallout warren={<Warren mood="celebrating" size={48} />}>
            <p className="font-medium">Warren</p>
            <p className="mt-1 text-muted-foreground">
              Mastery updated. Heat ∩ weakness refreshed.
            </p>
          </NotionCallout>
          <p className="text-sm text-muted-foreground">
            Reviewed{" "}
            <Annotate type="circle" show>
              3
            </Annotate>{" "}
            cards. Next: Learn diagram checkpoint, or keep comparing firm heat.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/mockups/mode-b">
              <Button>Go to Learn</Button>
            </Link>
            <Button variant="ghost" onClick={() => setStep("heat")}>
              Back to heat
            </Button>
          </div>
        </div>
      ) : null}
    </JourneyShell>
  )
}
