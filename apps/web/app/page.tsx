import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { ConcordLogo } from "@/components/concord-logo"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import {
  HandwritingHeadline,
  InkHoverScope,
  PaperSheet,
  RoughHover,
  Warren,
} from "@/components/paper"

/**
 * Landing — full-bleed cream paper document (DESIGN.md §2).
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
        ))
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
      <circle
        cx="14"
        cy="56"
        r="5.5"
        fill="#f7f1e4"
        stroke="#111"
        strokeWidth="1.4"
      />
      <circle
        cx="56"
        cy="38"
        r="5.5"
        fill="#d4cec0"
        stroke="#111"
        strokeWidth="1.4"
      />
      <rect
        x="91"
        y="13"
        width="14"
        height="14"
        rx="2"
        fill="#f7f1e4"
        stroke="#111"
        strokeWidth="1.4"
      />
    </svg>
  )
}

function InterviewerSketch() {
  return (
    <svg viewBox="0 0 112 76" className="h-16 w-full" aria-hidden>
      <circle
        cx="56"
        cy="28"
        r="14"
        fill="#f7f1e4"
        stroke="#111"
        strokeWidth="1.4"
      />
      <circle
        cx="50.5"
        cy="26"
        r="4"
        fill="none"
        stroke="#111"
        strokeWidth="1.2"
      />
      <circle
        cx="61.5"
        cy="26"
        r="4"
        fill="none"
        stroke="#111"
        strokeWidth="1.2"
      />
      <path d="M54.5 26 h3" stroke="#111" strokeWidth="1.2" />
      <path
        d="M51 35 q5 3 10 0"
        fill="none"
        stroke="#111"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
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
    title: "Firm topic heat",
    body: "See which topics show up most in interviews at each firm — accounting, LBO, valuation, and the rest. Use it to prioritise. It is a signal of what gets asked, not a bank of answers.",
    Sketch: HeatMatrixSketch,
  },
  {
    title: "Learn path",
    body: "Lessons in a sensible order, interactive diagrams, and checkpoints that teach the underlying finance step by step.",
    Sketch: RoadmapSketch,
  },
  {
    title: "Mock interviewers",
    body: "Practice interviews shaped around a firm, with the same interviewer each time so the format feels familiar.",
    Sketch: InterviewerSketch,
  },
] as const

export default function HomePage() {
  return (
    <main className="min-h-svh bg-paper px-4 py-6 text-ink md:px-10 md:py-10">
      <MockupSvgFilters />
      <article className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col px-2 py-4 md:px-4 md:py-6">
        <header className="flex items-center justify-between text-sm">
          <Link href="/" aria-label="Concord home">
            <ConcordLogo size="md" priority />
          </Link>
          <Link
            href="/sign-in"
            className="text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Sign in
          </Link>
        </header>

        <div className="py-14 md:py-20">
          <p className="mb-4 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            IB, PE & VC interview prep
          </p>
          <h1 className="max-w-4xl font-display text-5xl leading-[0.98] tracking-tight md:text-7xl">
            Learn the concept.
          </h1>
          <HandwritingHeadline
            phrase="Practise where it matters"
            className="mt-2 max-w-4xl [&_p]:text-5xl [&_p]:leading-[0.98] md:[&_p]:text-7xl"
          />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-graphite">
            Prep two ways. Company prep shows which topics your target firms ask
            most, so you practise what they actually care about. Learn walks you
            through the finance — lessons, diagrams, and checkpoints — so you can
            explain the ideas, not just recognise them. Heat tells you what to
            prioritise. Answers always come from our teaching materials, never from
            scraped interview reports.
          </p>
          <InkHoverScope
            selector="a[data-ink-hover]"
            className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-3"
          >
            <RoughHover padding={5}>
              <Link href="/onboarding">
                <Button size="lg">Start company prep</Button>
              </Link>
            </RoughHover>
            <RoughHover padding={5}>
              <Link href="/learn">
                <Button size="lg" variant="outline">
                  Browse modules
                </Button>
              </Link>
            </RoughHover>
            <Link
              href="/companies"
              data-ink-hover
              className="px-1 text-sm text-graphite underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Browse companies →
            </Link>
          </InkHoverScope>
        </div>

        <div className="mt-auto space-y-4">
          <div className="flex items-center gap-3">
            <Warren mood="idle" size={44} />
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              How Concord works
            </p>
          </div>
          <PaperSheet seedKey="landing-pillars">
            <ul className="grid gap-6 md:grid-cols-3">
              {PILLARS.map((pillar) => (
                <li key={pillar.title} className="space-y-2">
                  <div className="border border-ink/15 bg-paper px-2 py-1">
                    <pillar.Sketch />
                  </div>
                  <p className="font-medium">{pillar.title}</p>
                  <p className="text-xs leading-relaxed text-graphite">
                    {pillar.body}
                  </p>
                </li>
              ))}
            </ul>
          </PaperSheet>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Answers come from curated teaching materials. Firm topic patterns come
            from public interview reports — useful for focus, not for wording
            answers.
          </p>
        </div>
      </article>
    </main>
  )
}
