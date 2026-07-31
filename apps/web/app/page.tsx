import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { PaperSheet, Warren } from "@/components/paper"

/**
 * Landing — cream paper document on true-black chrome (DESIGN.md §2).
 * Monochrome + cream; the three pillar cards are static line art with no
 * fabricated numbers.
 */

function HeatMatrixSketch() {
  const cells = [
    ["#f7f1e4", "#d4cec0", "#b9b0a0", "#f7f1e4"],
    ["#d4cec0", "#8f867a", "#d4cec0", "#f7f1e4"],
    ["#f7f1e4", "#b9b0a0", "#f7f1e4", "#f7f1e4"],
  ]
  return (
    <svg viewBox="0 0 112 76" className="h-16 w-full" aria-hidden>
      {cells.map((row, y) =>
        row.map((fill, x) => (
          <rect
            key={`${x}-${y}`}
            x={6 + x * 25 + (y % 2 === 0 ? 0.6 : -0.6)}
            y={8 + y * 20 + (x % 2 === 0 ? 0.5 : -0.5)}
            width="21"
            height="16"
            rx="2"
            fill={fill}
            stroke="#111"
            strokeWidth="1.2"
          />
        )),
      )}
    </svg>
  )
}

function RoadmapSketch() {
  return (
    <svg viewBox="0 0 112 76" className="h-16 w-full" aria-hidden>
      <path
        d="M14 56 C 34 56, 36 38, 56 38 S 82 20, 98 20"
        fill="none"
        stroke="#111"
        strokeWidth="1.4"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <circle cx="14" cy="56" r="5.5" fill="#f7f1e4" stroke="#111" strokeWidth="1.4" />
      <circle cx="56" cy="38" r="5.5" fill="#d4cec0" stroke="#111" strokeWidth="1.4" />
      <rect x="91" y="13" width="14" height="14" rx="2" fill="#f7f1e4" stroke="#111" strokeWidth="1.4" />
    </svg>
  )
}

function InterviewerSketch() {
  return (
    <svg viewBox="0 0 112 76" className="h-16 w-full" aria-hidden>
      <circle cx="56" cy="28" r="14" fill="#f7f1e4" stroke="#111" strokeWidth="1.4" />
      <circle cx="50.5" cy="26" r="4" fill="none" stroke="#111" strokeWidth="1.2" />
      <circle cx="61.5" cy="26" r="4" fill="none" stroke="#111" strokeWidth="1.2" />
      <path d="M54.5 26 h3" stroke="#111" strokeWidth="1.2" />
      <path d="M51 35 q5 3 10 0" fill="none" stroke="#111" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M34 66 C 38 50, 46 46, 56 46 S 74 50, 78 66"
        fill="#d4cec0"
        stroke="#111"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

const PILLARS = [
  {
    title: "Heat matrix",
    body: "What each firm actually asks, from reported occurrence signals. Directional — never answer text.",
    Sketch: HeatMatrixSketch,
  },
  {
    title: "Module roadmap",
    body: "Prereq-ordered lessons, diagram labs, and checkpoints that teach the underlying finance.",
    Sketch: RoadmapSketch,
  },
  {
    title: "Interviewer cast",
    body: "Firm-templated mock stages with a fixed cast — same firm, same interviewer every run.",
    Sketch: InterviewerSketch,
  },
] as const

export default function HomePage() {
  return (
    <main className="min-h-svh bg-[#111] px-4 py-6 text-[#111] md:px-10 md:py-10">
      <MockupSvgFilters />
      <article className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col border border-black bg-[#f7f1e4] px-6 py-8 shadow-[6px_6px_0_0_rgba(255,255,255,0.12)] md:px-12 md:py-12">
        <header className="flex items-center justify-between text-sm">
          <span className="font-semibold tracking-tight">Concord</span>
          <Link
            href="/sign-in"
            className="text-[#555] underline-offset-4 transition-colors hover:text-[#111] hover:underline"
          >
            Sign in
          </Link>
        </header>

        <div className="py-14 md:py-20">
          <p className="mb-4 font-mono text-[11px] tracking-[0.14em] text-[#666] uppercase">
            Interview preparation, drawn clearly
          </p>
          <h1 className="max-w-4xl font-display text-5xl leading-[0.98] tracking-tight md:text-7xl">
            Learn the concept.
            <br />
            Practise where it matters.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#555]">
            Mode A reads firm occurrence heat so you drill what your targets actually ask. Mode B
            teaches the finance through modules and concept labs. The two never blur: signals stay
            directional, teaching answers come from the curated corpus — labelled as such,
            everywhere.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-3">
            <Link href="/onboarding">
              <Button size="lg">Start company prep</Button>
            </Link>
            <Link href="/learn">
              <Button size="lg" variant="outline">
                Browse modules
              </Button>
            </Link>
            <Link
              href="/companies"
              className="px-1 text-sm text-[#555] underline-offset-4 transition-colors hover:text-[#111] hover:underline"
            >
              See a company room →
            </Link>
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <div className="flex items-center gap-3">
            <Warren mood="idle" size={44} />
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#666] uppercase">
              Three pillars, one calm document
            </p>
          </div>
          <PaperSheet seedKey="landing-pillars">
            <ul className="grid gap-6 md:grid-cols-3">
              {PILLARS.map((pillar) => (
                <li key={pillar.title} className="space-y-2">
                  <div className="border border-black/15 bg-[#f7f1e4] px-2 py-1">
                    <pillar.Sketch />
                  </div>
                  <p className="font-medium">{pillar.title}</p>
                  <p className="text-xs leading-relaxed text-[#555]">{pillar.body}</p>
                </li>
              ))}
            </ul>
          </PaperSheet>
          <p className="text-xs leading-relaxed text-[#666]">
            Teaching corpus: curated public sources and validated enrichment. Glassdoor:
            directional firm-signal only.
          </p>
        </div>
      </article>
    </main>
  )
}
