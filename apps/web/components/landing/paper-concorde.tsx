"use client"

/**
 * Landing (DESIGN.md §17): one long scroll. An index card on a busy desk
 * folds into a paper Concorde, takes off over a paper-cut skyline, climbs
 * through torn-paper clouds past the product, cruises at night and lands on
 * a Concorde boarding pass that is the sign-up.
 *
 * Performance: scroll progress goes through `frameAt` (lib/landing) and the
 * result is written straight onto the ~40 animated elements as opacity /
 * transform, only when a value changes. Nothing sets inherited CSS variables,
 * so a frame never restyles the rest of the page; faded-out pieces get
 * `visibility: hidden` so they skip paint. Reduced motion gets still frames.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { ConcordLogo } from "@/components/concord-logo"
import { CARD_FILL, CARD_H, CARD_W, FACETS, SKY_STOPS, facetPoints, mixHex, vertexAt } from "@/lib/landing/plane-geometry"
import { CLOUDS, frameAt, type PieceStyle } from "@/lib/landing/scroll-frame"

import {
  Birds,
  CardStack,
  DailySetTag,
  DeskClutter,
  DistantPlane,
  DrillCard,
  Earth,
  GradedCard,
  HeatCard,
  NightSky,
  PaperMoon,
  PaperSun,
  ShootingStar,
  Skyline,
  TallyScrap,
  TornCloud,
  TornEdgeFilter,
  hand,
} from "./landing-art"
import "./landing-intro.css"

export const HEADLINE = ["CS has LeetCode.", "You have Concord."] as const
const SUBHEAD = "Interview prep for investment banking and private equity."
const CTA = "Start prepping"

const FEATURES = [
  { title: "See what each firm actually asks.", side: "left", Card: HeatCard },
  { title: "Get every answer graded.", side: "right", Card: GradedCard },
  { title: "Drill the math until it's automatic.", side: "left", Card: DrillCard },
] as const

/** Moonlit cloud deck under the plane at cruise: x (vw), width (vw), bottom (vh), silhouette. */
const NIGHT_CLOUDS = [
  { x: -6, w: 36, bottom: 4, shape: 1, tone: "#22345a" },
  { x: 26, w: 30, bottom: -2, shape: 0, tone: "#1d2e52" },
  { x: 52, w: 34, bottom: 6, shape: 2, tone: "#26395f" },
  { x: 78, w: 30, bottom: 0, shape: 1, tone: "#1f3055" },
] as const

const STARS = Array.from({ length: 64 }, (_, i) => ({
  x: (i * 37) % 100,
  y: (i * 53) % 70,
  size: i % 9 === 0 ? 3 : 2,
  o: 0.3 + ((i * 7) % 6) / 10,
}))

function usePrefersReducedMotion(): boolean | null {
  const [reduced, setReduced] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return reduced
}

/** Inline style for a piece at the top of the page (server render, before the first frame). */
function initialStyle(style: PieceStyle | undefined): React.CSSProperties {
  if (!style) return {}
  return {
    ...(style.opacity !== undefined ? { opacity: style.opacity, visibility: style.opacity < 0.002 ? "hidden" : undefined } : {}),
    ...(style.transform !== undefined ? { transform: style.transform } : {}),
  }
}

function CtaButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sign-up"
      className={`group inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-base font-medium text-paper shadow-[0_1px_0_rgb(0_0_0/0.2),0_8px_18px_rgb(60_45_20/0.18)] outline-offset-4 transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-ink ${className}`}
    >
      {CTA}
      <span aria-hidden className="transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:transition-none">
        →
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------------ plane */

type PlaneParts = {
  facets: Array<SVGPolygonElement | null>
  sheens: Array<SVGPolygonElement | null>
  sheet: SVGRectElement | null
  face: SVGGElement | null
  keel: SVGLineElement | null
}

function planeLook(fold: number, question: boolean) {
  return {
    sheet: question ? Math.max(0, 1 - fold * 30) : 0,
    sheen: question ? fold : 1,
    face: Math.max(0, 1 - fold * 4),
    keel: question ? Math.min(1, Math.max(0, (fold - 0.8) * 5)) : 1,
    stroke: fold > 0.02 ? "rgba(17,17,17,0.35)" : "none",
  }
}

/** Move the fold: vertices, facet shades and the card-face / keel fades. */
function setFold(parts: PlaneParts, fold: number) {
  const look = planeLook(fold, true)
  FACETS.forEach((facet, i) => {
    const points = facetPoints(facet.vertices, fold)
    const el = parts.facets[i]
    if (el) {
      el.setAttribute("points", points)
      el.setAttribute("fill", mixHex(CARD_FILL, facet.shade, fold))
      el.setAttribute("stroke", look.stroke)
    }
    const sheen = parts.sheens[i]
    if (sheen) {
      sheen.setAttribute("points", points)
      sheen.setAttribute("opacity", look.sheen.toFixed(3))
    }
  })
  parts.sheet?.setAttribute("opacity", look.sheet.toFixed(3))
  parts.face?.setAttribute("opacity", look.face.toFixed(3))
  parts.keel?.setAttribute("opacity", look.keel.toFixed(3))
}

/** The card / plane SVG. `fold` 0 = flat card, 1 = paper Concorde. */
type PartName = "sheet" | "face" | "keel" | "facets" | "sheens"
type OnPart = (name: PartName, el: SVGElement | null, index?: number) => void

function PaperPlane({ onPart, fold = 0, question = true }: { onPart?: OnPart; fold?: number; question?: boolean }) {
  const keelFrom = vertexAt("tail", 1)
  const keelTo = vertexAt("nose", 1)
  const look = planeLook(fold, question)
  return (
    <svg viewBox={`-20 -20 ${CARD_W + 40} ${CARD_H + 40}`} className="hero-sheet relative block h-auto w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="facet-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2e1c" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* One sheet under the facets so no seams show before the fold. */}
      <rect
        ref={(el) => {
          onPart?.("sheet", el)
        }}
        width={CARD_W}
        height={CARD_H}
        fill={CARD_FILL}
        opacity={look.sheet}
      />
      {FACETS.map((facet, i) => (
        <polygon
          key={facet.id}
          ref={(el) => {
            onPart?.("facets", el, i)
          }}
          points={facetPoints(facet.vertices, fold)}
          fill={mixHex(CARD_FILL, facet.shade, fold)}
          stroke={look.stroke}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
      {FACETS.map((facet, i) => (
        <polygon
          key={`${facet.id}-sheen`}
          ref={(el) => {
            onPart?.("sheens", el, i)
          }}
          points={facetPoints(facet.vertices, fold)}
          fill="url(#facet-sheen)"
          opacity={look.sheen}
        />
      ))}
      {question ? (
        <g
          ref={(el) => {
            onPart?.("face", el)
          }}
          opacity={look.face}
        >
          <line x1="0" y1="54" x2={CARD_W} y2="54" stroke="rgba(215,162,162,0.9)" strokeWidth="1.4" />
          {[86, 118, 150, 182, 214].map((y) => (
            <line key={y} x1="0" y1={y} x2={CARD_W} y2={y} stroke="rgba(157,180,207,0.45)" strokeWidth="1" />
          ))}
          <text x="24" y="40" className="font-mono" fontSize="11" letterSpacing="2" fill="#555">
            QUESTION 1 OF 8
          </text>
          <text x="24" y="110" className={hand.className} fontSize="34" fill="#1d2a4a">
            Walk me through a DCF.
          </text>
          <text x="24" y="144" className={hand.className} fontSize="22" fill="#1d2a4a" opacity="0.65">
            Start with unlevered free cash flow...
          </text>
        </g>
      ) : null}
      <line
        ref={(el) => {
          onPart?.("keel", el)
        }}
        x1={keelFrom[0]}
        y1={keelFrom[1]}
        x2={keelTo[0]}
        y2={keelTo[1]}
        stroke="rgba(17,17,17,0.55)"
        strokeWidth="1"
        strokeLinecap="round"
        opacity={look.keel}
      />
    </svg>
  )
}

/** A product card with its line on a torn, taped strip above it. */
function Feature({ title, Card }: { title: string; Card: () => React.ReactElement }) {
  return (
    <figure className="relative">
      <figcaption className="relative z-10 mx-auto mb-3 w-fit -rotate-1">
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 z-10 h-4 w-14 -translate-x-1/2 rotate-2 bg-[#efe6cf]/85 shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
        />
        <span className="paper-torn block bg-[#fffdf8] bg-[image:var(--paper-grain)] px-4 py-2.5 text-center font-display text-2xl tracking-tight text-ink [--torn-h:6px] [filter:drop-shadow(0_6px_10px_rgb(30_40_70/0.18))] md:text-[1.7rem]">
          {title}
        </span>
      </figcaption>
      <div className="[filter:drop-shadow(0_10px_18px_rgb(30_40_70/0.2))]">
        <Card />
      </div>
    </figure>
  )
}

/* --------------------------------------------------------- boarding pass */

const PRINTED = "font-mono uppercase tracking-[0.14em] text-[#7d7d7d] [text-shadow:0_0_0.7px_rgb(0_0_0/0.35)]"
const PASS_LABEL = "font-sans text-[10px] font-semibold uppercase tracking-[0.04em] text-[#3a3b3e] md:text-[11px]"

/** The Concord mark as printed on the pass: a small swoosh over small caps. */
function PassWordmark({ className = "", size = "lg" }: { className?: string; size?: "lg" | "sm" }) {
  const big = size === "lg"
  return (
    <div className={`flex flex-col items-end leading-none ${className}`}>
      <svg viewBox="0 0 60 12" className={big ? "mb-1 w-14" : "mb-0.5 w-10"} aria-hidden>
        <path d="M2 9 C 22 2, 40 1, 58 4 C 44 4, 30 6, 18 10 Z" fill="currentColor" />
      </svg>
      <span className={`font-sans font-medium tracking-[0.08em] ${big ? "text-[2.1rem] md:text-[2.6rem]" : "text-xl"}`}>
        C<span className={big ? "text-[1.6rem] md:text-[2rem]" : "text-[0.95rem]"}>ONCORD</span>
      </span>
    </div>
  )
}

function PassBox({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex min-h-24 flex-col bg-[#f4f3ef] px-3 pt-2 pb-3 md:min-h-28 ${className}`}>
      <span className={`${PASS_LABEL} text-center`}>{label}</span>
      <span className={`${PRINTED} mt-auto text-right text-3xl tracking-[0.08em] md:text-[2.6rem]`}>{value}</span>
    </div>
  )
}

/**
 * Boarding pass after the 1990s Concorde passes: charcoal coupon with white
 * printed boxes, a fast-track sticker and a light stub you tear off. Tearing
 * the stub opens /sign-up.
 */
export function BoardingPass({ reduced }: { reduced: boolean }) {
  const router = useRouter()
  const [torn, setTorn] = React.useState(false)

  function tear(event: React.MouseEvent<HTMLAnchorElement>) {
    if (reduced || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    setTorn(true)
    window.setTimeout(() => router.push("/sign-up"), 380)
  }

  return (
    <section
      aria-labelledby="board-heading"
      className="relative flex min-h-[100svh] flex-col items-center justify-center gap-10 overflow-hidden bg-paper bg-[image:var(--paper-grain)] px-4 py-24"
    >
      <h2 id="board-heading" className="text-center font-display text-4xl tracking-tight text-ink md:text-6xl">
        Would love to have you on board!
      </h2>

      <div className="relative w-full max-w-5xl">
        {/* Clear mounting tabs, as on a framed pass. */}
        <span aria-hidden className="absolute -top-2 left-[30%] z-10 h-3.5 w-[34%] rounded-[2px] bg-white/25 shadow-[0_1px_1px_rgb(0_0_0/0.08)] ring-1 ring-white/50 backdrop-saturate-150" />
        <span aria-hidden className="absolute -bottom-2 left-[30%] z-10 h-3.5 w-[34%] rounded-[2px] bg-white/25 shadow-[0_1px_1px_rgb(0_0_0/0.08)] ring-1 ring-white/50" />

        <div
          className="grid overflow-hidden rounded-[18px] md:grid-cols-[1fr_17rem]"
          style={{ filter: "drop-shadow(0 1px 0.6px rgb(0 0 0 / 0.35)) drop-shadow(0 22px 34px rgb(40 30 15 / 0.22))" }}
          data-testid="boarding-pass"
        >
          {/* Coupon. */}
          <div className="relative bg-[#3a3b3e] bg-[image:var(--paper-grain)] px-5 pt-6 pb-5 text-[#ecebe6] md:px-8 md:pt-8">
            <PassWordmark className="mx-auto w-fit items-center text-[#ecebe6]" />

            <div className="mt-6 grid grid-cols-[1fr_auto] gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 md:gap-8">
                  <PassBox label="Gate" value="" />
                  <PassBox label="Gate closes" value="0730" />
                  <PassBox label="Seat" value="01A" />
                </div>

                <div className="relative flex min-h-20 items-start bg-[#f4f3ef] px-4 py-3">
                  <span className={`${PRINTED} text-lg md:text-xl`}>No cramming</span>
                  {/* Fast-track sticker. */}
                  <div className="absolute top-1.5 right-1.5 bottom-1.5 flex w-[46%] max-w-56 items-center rounded-[3px] bg-white p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.25)] md:w-56">
                    <div className="relative h-full w-full overflow-hidden bg-[#1f5a3a] [clip-path:polygon(0_0,100%_0,100%_100%,6%_100%)]">
                      <span className="absolute top-1 right-2 font-sans text-[9px] font-semibold whitespace-nowrap text-white md:text-[10px]">
                        Concord · 12 min
                      </span>
                      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                        <path d="M0 40 L 34 0 L 38 0 L 6 40 Z" fill="#fff" opacity="0.92" />
                      </svg>
                      <span className="absolute right-2 bottom-1 font-sans text-[11px] font-bold tracking-[0.22em] whitespace-nowrap text-white italic sm:text-sm md:text-base md:tracking-[0.3em]">
                        FAST TRACK
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#f4f3ef] px-4 py-3">
                  <p className={`${PRINTED} text-sm md:text-lg`}>You/Candidate</p>
                  <p className={`${PRINTED} mt-1 flex flex-wrap gap-x-6 text-sm md:gap-x-10 md:text-lg`}>
                    <span>CC 001</span>
                    <span>Today</span>
                    <span>Candidate</span>
                    <span>CND</span>
                  </p>
                </div>
              </div>

              <p className="hidden w-44 font-sans text-[10px] leading-[1.35] text-[#ecebe6]/85 md:block">
                <span className="font-semibold uppercase">Not valid without a daily set attached.</span>
                <br />
                <br />
                Subject to the conditions of recruiting season. Practice questions come from what each firm actually asks.
                <br />
                <br />
                Please be at the gate for about 12 minutes a day before your interview.
              </p>
            </div>

            <div className="mt-5">
              <p className="font-sans text-2xl font-semibold tracking-[0.04em] uppercase md:text-[1.8rem]">Boarding pass</p>
              <p className="font-sans text-[8px] text-[#ecebe6]/70 md:text-[9px]">
                Carte d&apos;accès à bord / Bordkarte / Tarjeta de embarque
              </p>
            </div>
          </div>

          {/* Stub: tear it off to sign up. */}
          <div
            className={`relative flex flex-col border-t-2 border-dashed border-[#3a3b3e]/40 bg-[#f4f3ef] bg-[image:var(--paper-grain)] transition-[transform,opacity] duration-[380ms] ease-in md:border-t-0 md:border-l-2 ${torn ? "translate-x-6 translate-y-10 rotate-[9deg] opacity-0" : ""}`}
          >
            <span aria-hidden className="absolute top-[-9px] left-[-9px] hidden size-4 rounded-full bg-paper md:block" />
            <span aria-hidden className="absolute bottom-[-9px] left-[-9px] hidden size-4 rounded-full bg-paper md:block" />
            <div className="flex items-end justify-between bg-[#3a3b3e] px-4 pt-3 pb-2 text-[#ecebe6]">
              <span className="font-sans text-sm font-semibold tracking-[0.06em] uppercase">Concord Air</span>
              <PassWordmark size="sm" className="text-[#ecebe6]" />
            </div>
            <div className="flex flex-1 flex-col gap-2 px-4 pt-2 pb-4">
              <div>
                <p className="font-sans text-[7px] uppercase text-[#3a3b3e]">Name of passenger</p>
                <p className={`${PRINTED} text-sm`}>You/Candidate</p>
                <p className={`${PRINTED} text-sm`}>Concord</p>
              </div>
              <div className={`${PRINTED} grid grid-cols-[1.5rem_1fr_auto] gap-x-2 text-sm`}>
                <span className="font-sans text-[7px] text-[#3a3b3e]">FROM</span>
                <span>Candidate</span>
                <span>CND</span>
                <span className="font-sans text-[7px] text-[#3a3b3e]">TO</span>
                <span>Offer</span>
                <span>OFR</span>
              </div>
              <div className="grid grid-cols-3 border border-[#3a3b3e]/40">
                {[
                  ["Carrier / flight", "CC 001"],
                  ["Class / date", "J Today"],
                  ["Time", "0730"],
                ].map(([label, value]) => (
                  <div key={label} className="border-r border-[#3a3b3e]/30 px-1.5 py-1 last:border-r-0">
                    <p className="font-sans text-[6.5px] uppercase text-[#3a3b3e]">{label}</p>
                    <p className={`${PRINTED} text-[11px] tracking-[0.06em]`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-end justify-between border border-[#3a3b3e]/40 px-2 py-1.5">
                <div>
                  <p className={PASS_LABEL}>Seat</p>
                  <p className={`${PRINTED} text-3xl tracking-[0.06em]`}>01A</p>
                </div>
                <Link
                  href="/sign-up"
                  onClick={tear}
                  className="rounded-md bg-[#3a3b3e] px-4 py-2.5 text-sm font-medium text-[#f4f3ef] outline-offset-4 hover:bg-[#2b2c2e] focus-visible:outline-2 focus-visible:outline-ink"
                >
                  {CTA}
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-1 pt-1">
                {[
                  ["Pcs", "0"],
                  ["Ck wt", "0"],
                  ["Days", "1"],
                  ["Seq no", "001"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="font-sans text-[6.5px] uppercase text-[#3a3b3e]">{label}</p>
                    <p className={`${PRINTED} text-sm tracking-[0.06em]`}>{value}</p>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 120 22" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
                {Array.from({ length: 46 }, (_, i) => (
                  <rect key={i} x={i * 2.6} y="0" width={(i * 7) % 3 === 0 ? 1.6 : 0.8} height="22" fill="#4a4b4e" />
                ))}
              </svg>
              <p className="mt-auto pt-2 font-sans text-[9px] font-semibold tracking-[0.02em] text-[#3a3b3e] uppercase">
                Passenger ticket and baggage check
              </p>
              <p className="text-[10px] text-[#3a3b3e]/70">Tear here to start.</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------- frames */

function Headline() {
  return (
    <h1 className="text-center font-display text-5xl leading-[1.02] tracking-tight text-ink md:text-7xl">
      <span className="intro-rise block [--intro-delay:300ms]">{HEADLINE[0]}</span>
      <span className="intro-rise block [--intro-delay:460ms]">{HEADLINE[1]}</span>
    </h1>
  )
}

function StillFrames() {
  return (
    <div className="bg-paper">
      <TornEdgeFilter />
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center gap-8 overflow-hidden bg-[image:var(--paper-grain)] px-4 pt-24 pb-16">
        <Headline />
        <div className="relative w-[min(80vw,30rem)] [filter:drop-shadow(0_10px_18px_rgb(60_45_20/0.12))]">
          <CardStack />
          <PaperPlane fold={0} />
        </div>
        <p className="max-w-md text-center text-lg text-ink">{SUBHEAD}</p>
        <CtaButton />
      </section>
      <section className="relative flex flex-col items-center gap-12 overflow-hidden bg-[linear-gradient(#a9c9e2,#e4eef3)] px-4 py-24">
        <PaperSun className="top-10 right-[10vw] w-28" />
        <div className="w-[min(70vw,24rem)]">
          <PaperPlane fold={1} question={false} />
        </div>
        <div className="grid w-full max-w-6xl gap-10 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Feature key={feature.title} title={feature.title} Card={feature.Card} />
          ))}
        </div>
      </section>
      <section className="relative flex min-h-[60svh] flex-col items-center justify-center gap-8 overflow-hidden bg-[linear-gradient(#0f1730,#2b4268)] px-4 py-20">
        <PaperMoon className="top-10 left-[8vw] w-20" />
        <NightSky />
        <p className="text-center font-display text-4xl tracking-tight text-[#f7f1e4] md:text-6xl">
          It only takes about 12 minutes a day.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          <DailySetTag className="!static w-60 rotate-[3deg]" />
          <TallyScrap className="!static w-56" />
        </div>
      </section>
      <BoardingPass reduced />
    </div>
  )
}

export function PaperConcordeLanding() {
  const reduced = usePrefersReducedMotion()
  const stageRef = React.useRef<HTMLDivElement>(null)
  const contrailRef = React.useRef<SVGPathElement>(null)
  const cardIntroRef = React.useRef<HTMLDivElement>(null)
  const hintRef = React.useRef<HTMLSpanElement>(null)
  const nodes = React.useRef(new Map<string, HTMLElement | SVGElement>())
  const plane = React.useRef<PlaneParts>({ facets: [], sheens: [], sheet: null, face: null, keel: null })
  const initial = React.useMemo(() => frameAt(0, false).pieces, [])
  const onPart = React.useCallback<OnPart>((name, el, index) => {
    const parts = plane.current
    if (name === "facets" || name === "sheens") parts[name][index ?? 0] = el as SVGPolygonElement | null
    else if (name === "sheet") parts.sheet = el as SVGRectElement | null
    else if (name === "face") parts.face = el as SVGGElement | null
    else parts.keel = el as SVGLineElement | null
  }, [])

  const bind = React.useCallback(
    (key: string) => (el: HTMLElement | SVGElement | null) => {
      if (el) nodes.current.set(key, el)
      else nodes.current.delete(key)
    },
    []
  )
  /** ref + initial style for a piece. */
  const piece = (key: string, style?: React.CSSProperties) => ({
    ref: bind(key),
    style: { ...style, ...initialStyle(initial[key]) },
  })

  React.useEffect(() => {
    if (reduced !== false) return
    const stage = stageRef.current
    if (!stage) return
    let frame = 0
    let lastFold = -1
    let lastContrail = ""
    let touched = false
    const written = new WeakMap<Element, { o?: string; t?: string }>()

    const render = () => {
      frame = 0
      const rect = stage.getBoundingClientRect()
      const travel = Math.max(1, rect.height - window.innerHeight)
      const p = Math.min(1, Math.max(0, -rect.top / travel))
      const next = frameAt(p, window.innerWidth < 768)
      // First scroll: stop the idle float and the scroll nudge (the intro itself keeps going on its own layer).
      if (!touched && p > 0.001) {
        touched = true
        cardIntroRef.current?.setAttribute("data-touched", "")
        hintRef.current?.setAttribute("data-touched", "")
      }

      for (const [key, style] of Object.entries(next.pieces)) {
        const el = nodes.current.get(key)
        if (!el) continue
        const prev = written.get(el) ?? {}
        if (style.opacity !== undefined) {
          const o = style.opacity.toFixed(3)
          if (prev.o !== o) {
            el.style.opacity = o
            el.style.visibility = style.opacity < 0.002 ? "hidden" : ""
            prev.o = o
          }
        }
        if (style.transform !== undefined && prev.t !== style.transform) {
          el.style.transform = style.transform
          prev.t = style.transform
        }
        written.set(el, prev)
      }

      if (Math.abs(next.fold - lastFold) > 0.0005) {
        lastFold = next.fold
        setFold(plane.current, next.fold)
      }
      const dash = next.contrail.toFixed(3)
      if (dash !== lastContrail) {
        lastContrail = dash
        contrailRef.current?.setAttribute("stroke-dashoffset", dash)
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render)
    }
    render()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [reduced])

  if (reduced) return <StillFrames />

  const layer = "pointer-events-none absolute inset-0"
  return (
    <div className="bg-paper">
      <div ref={stageRef} className="relative h-[760svh]" data-testid="landing-stage">
        <div className="sticky top-0 h-[100svh] overflow-hidden bg-paper [contain:layout_paint]">
          <TornEdgeFilter />

          {/* Sky: fixed gradients crossfaded by opacity (no gradient repaint). */}
          {SKY_STOPS.map((stop, i) => (
            <div
              key={i}
              aria-hidden
              className={`${layer} will-change-[opacity]`}
              {...piece(`sky-${i}`, { background: `linear-gradient(${stop.top}, ${stop.bottom})` })}
            />
          ))}

          {/* The desk; drops away on takeoff. */}
          <div aria-hidden className={`${layer} bg-paper bg-[image:var(--paper-grain)] will-change-[transform,opacity]`} {...piece("desk-bg")} />
          <DeskClutter bind={bind} />

          {/* Dawn: sun and the city falling away below. */}
          <PaperSun className="top-0 right-[10vw] w-[min(26vw,9rem)] will-change-[transform,opacity]" {...piece("sun")} />
          <Skyline {...piece("skyline")} />
          <Birds className="top-[16vh] left-[56vw] w-[min(30vw,11rem)] will-change-[transform,opacity]" {...piece("birds")} />

          {/* Night: stars, moon and constellations. */}
          <div aria-hidden className={`${layer} will-change-[opacity]`} {...piece("night")}>
            {STARS.map((star, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-[#f7f1e4]"
                style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.o }}
              />
            ))}
            <PaperMoon className="top-[10vh] left-[6vw] w-[min(20vw,7rem)] md:top-[12vh] md:left-[8vw]" />
            <NightSky />
          </div>
          <ShootingStar {...piece("shoot", { willChange: "transform, opacity" })} />
          <Earth {...piece("earth")} />

          {/* Moonlit cloud deck below the plane. */}
          <div aria-hidden className={`${layer} will-change-[transform,opacity]`} {...piece("night-clouds")}>
            {NIGHT_CLOUDS.map((cloud) => (
              <TornCloud
                key={cloud.x}
                tone={cloud.tone}
                rim="#7f95c2"
                shape={cloud.shape}
                className="absolute"
                style={{ left: `${cloud.x}vw`, width: `max(${cloud.w}vw, 14rem)`, bottom: `${cloud.bottom}vh` }}
              />
            ))}
          </div>
          <DistantPlane className="top-[58vh] right-[16vw] w-14 will-change-[transform,opacity]" {...piece("dplane-0")} />
          <DistantPlane
            className="top-[66vh] left-[20vw] hidden w-9 will-change-[transform,opacity] md:block"
            {...piece("dplane-1")}
          />

          {/* Torn-paper clouds, at different depths. */}
          <div aria-hidden className={`${layer} will-change-[opacity]`} {...piece("clouds")}>
            {CLOUDS.map((cloud, i) => (
              <TornCloud
                key={i}
                tone={cloud.tone}
                shape={cloud.shape}
                className="absolute will-change-transform"
                {...piece(`cloud-${i}`, {
                  left: `${cloud.x}vw`,
                  width: `max(${cloud.w}vw, ${cloud.far ? 7 : 12}rem)`,
                  top: `${cloud.y}vh`,
                  opacity: cloud.far ? 0.7 : 1,
                })}
              />
            ))}
          </div>

          {/* Home at dusk: the city comes back up as the plane lands. */}
          <Skyline {...piece("home")} />

          {/* Contrail at cruise: a pen line drawn behind the plane. */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full will-change-[opacity]"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            {...piece("contrail")}
          >
            <path
              ref={contrailRef}
              d="M -5 66 C 15 60, 30 47, 44 40"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1}
              fill="none"
              stroke="#f7f1e4"
              strokeWidth="0.3"
              strokeLinecap="round"
              opacity="0.8"
            />
          </svg>

          {/* The card that becomes the plane. */}
          <div
            className="hero-card absolute top-1/2 left-1/2 w-[min(80vw,30rem)] will-change-transform"
            data-testid="landing-plane"
            {...piece("plane", { filter: "drop-shadow(0 14px 22px rgb(30 40 70 / 0.18))" })}
          >
            {/* Intro layer: drops the card in, then floats it until the first scroll. */}
            <div ref={cardIntroRef} className="intro-card relative">
              <CardStack {...piece("card-stack")} />
              <PaperPlane onPart={onPart} />
            </div>
          </div>

          {/* Hero copy. */}
          <div className="pointer-events-none absolute inset-x-4 top-[12vh] will-change-[transform,opacity] md:top-[11vh]" {...piece("hero-head")}>
            <Headline />
          </div>
          <div className="pointer-events-none absolute inset-x-4 bottom-[8vh] flex flex-col items-center gap-4 will-change-[opacity]" {...piece("hero-cta")}>
            <p className="intro-rise max-w-md text-center text-base text-ink [--intro-delay:700ms] md:text-lg">{SUBHEAD}</p>
            <CtaButton className="intro-rise pointer-events-auto [--intro-delay:840ms]" />
          </div>
          <p
            aria-hidden
            className="absolute inset-x-0 bottom-3 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase"
            {...piece("hint")}
          >
            <span ref={hintRef} className="intro-hint inline-block">
              Scroll
            </span>
          </p>

          <p
            aria-hidden
            className="absolute inset-x-0 top-[16vh] text-center font-display text-7xl tracking-tight text-ink will-change-[opacity] md:text-9xl"
            {...piece("wordmark")}
          >
            Concord
          </p>

          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`absolute bottom-[5vh] left-1/2 w-[min(88vw,25rem)] -translate-x-1/2 md:top-1/2 md:bottom-auto md:translate-x-0 ${feature.side === "left" ? "md:left-[6vw]" : "md:right-[6vw] md:left-auto"}`}
            >
              <div className="md:-translate-y-1/2">
                <div className="will-change-[transform,opacity]" {...piece(`feature-${i}`)}>
                  <Feature title={feature.title} Card={feature.Card} />
                </div>
              </div>
            </div>
          ))}

          <p
            className="absolute inset-x-4 top-[20vh] text-center font-display text-4xl tracking-tight text-[#f7f1e4] will-change-[opacity] md:top-[18vh] md:text-6xl"
            {...piece("night-copy")}
          >
            It only takes about 12 minutes a day.
          </p>
          <DailySetTag
            className="bottom-[9vh] left-[6vw] w-[min(64vw,15rem)] rotate-[4deg] will-change-[opacity] md:bottom-[12vh] md:left-[8vw]"
            {...piece("tag")}
          />
          <TallyScrap
            className="right-[6vw] bottom-[14vh] hidden w-[15rem] rotate-[-3deg] will-change-[opacity] md:block"
            {...piece("tally")}
          />
          <p
            aria-hidden
            className="absolute right-6 bottom-6 font-mono text-[11px] tracking-[0.18em] text-[#f7f1e4]/80 uppercase"
            {...piece("altitude")}
          >
            FL600 · 60,000 ft
          </p>
        </div>
      </div>
      <BoardingPass reduced={false} />
    </div>
  )
}

/** Fixed header on a paper strip: mark, sign in and the main call to action. */
export function LandingHeader() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:px-5">
      <div className="intro-header pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-lg bg-[#fffdf8] bg-[image:var(--paper-grain)] py-2 pr-2 pl-4 shadow-[0_1px_0_rgb(60_45_20/0.12),0_8px_20px_rgb(30_40_70/0.12)]">
        <Link href="/" aria-label="Concord home" className="flex items-center gap-2">
          <ConcordLogo size="sm" priority />
          <span className="hidden font-display text-xl tracking-tight text-ink sm:inline">Concord</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
            {CTA}
          </Link>
        </nav>
      </div>
    </header>
  )
}

/** Exported for tests: the copy on the page, in order. */
export const LANDING_COPY = [
  ...HEADLINE,
  SUBHEAD,
  "Concord",
  ...FEATURES.map((f) => f.title),
  "It only takes about 12 minutes a day.",
  "Would love to have you on board!",
] as const
