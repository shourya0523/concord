"use client"

/**
 * Landing (DESIGN.md §17): one long scroll. An index card on a busy desk
 * folds into a paper Concorde, takes off over a paper-cut skyline, climbs
 * through torn-paper clouds past the product, cruises at night and lands on
 * a boarding pass that is the sign-up.
 *
 * Scroll drives one progress value; a rAF handler turns it into CSS custom
 * properties (transforms + opacity only) and moves the fold's polygon
 * vertices. Reduced motion gets the same scenes as still frames.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { ConcordLogo } from "@/components/concord-logo"
import {
  CARD_FILL,
  CARD_H,
  CARD_W,
  FACETS,
  facetPoints,
  mixHex,
  segment,
  skyAt,
  vertexAt,
} from "@/lib/landing/plane-geometry"

import {
  Birds,
  CardStack,
  DeskClutter,
  DrillCard,
  GradedCard,
  HeatCard,
  PaperMoon,
  PaperSun,
  Skyline,
  TallyScrap,
  TornCloud,
  TornEdgeFilter,
  hand,
} from "./landing-art"

export const HEADLINE = ["CS has LeetCode.", "You have Concord."] as const
const SUBHEAD = "Interview prep for investment banking and private equity."
const CTA = "Start prepping"

/** Scene windows along the stage's scroll progress (0–1). */
const SCENES = {
  hint: [0, 0.05],
  fold: [0.07, 0.24],
  takeoff: [0.24, 0.4],
  clouds: [0.34, 0.76],
  cruise: [0.7, 0.88],
  land: [0.88, 1],
} as const

const FEATURES = [
  { title: "See what each firm actually asks.", window: [0.4, 0.53], side: "left", Card: HeatCard },
  { title: "Get every answer graded.", window: [0.51, 0.64], side: "right", Card: GradedCard },
  { title: "Drill the math until it's automatic.", window: [0.62, 0.75], side: "left", Card: DrillCard },
] as const

/** Torn-paper clouds: x (vw), width (vw), depth (scroll speed), start offset (vh), silhouette. */
const CLOUDS = [
  { x: 70, w: 14, speed: 0.45, y: -20, tone: "#eef1f5", shape: 2, far: true },
  { x: 4, w: 12, speed: 0.4, y: -80, tone: "#eef1f5", shape: 1, far: true },
  { x: 40, w: 16, speed: 0.5, y: -140, tone: "#eef1f5", shape: 0, far: true },
  { x: 84, w: 12, speed: 0.42, y: -200, tone: "#eef1f5", shape: 1, far: true },
  { x: -4, w: 34, speed: 1.0, y: -40, tone: "#fbfaf6", shape: 0, far: false },
  { x: 62, w: 30, speed: 1.35, y: -90, tone: "#f6f3ec", shape: 1, far: false },
  { x: 14, w: 22, speed: 0.75, y: -150, tone: "#fdfcf9", shape: 2, far: false },
  { x: 72, w: 24, speed: 1.6, y: -170, tone: "#fbfaf6", shape: 0, far: false },
  { x: -8, w: 40, speed: 1.15, y: -230, tone: "#f4f1ea", shape: 1, far: false },
  { x: 42, w: 26, speed: 0.9, y: -260, tone: "#fdfcf9", shape: 2, far: false },
  { x: 66, w: 34, speed: 1.25, y: -320, tone: "#f6f3ec", shape: 0, far: false },
  { x: 20, w: 30, speed: 1.4, y: -380, tone: "#fbfaf6", shape: 1, far: false },
] as const

function windowOpacity(p: number, [start, end]: readonly [number, number]): number {
  const fadeIn = segment(p, start, start + (end - start) * 0.25)
  const fadeOut = 1 - segment(p, end - (end - start) * 0.25, end)
  return Math.min(fadeIn, fadeOut)
}

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

function CtaButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sign-up"
      className={`inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-base font-medium text-paper shadow-[0_1px_0_rgb(0_0_0/0.2),0_8px_18px_rgb(60_45_20/0.18)] outline-offset-4 transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-ink ${className}`}
    >
      {CTA}
      <span aria-hidden>→</span>
    </Link>
  )
}

/** The card / plane SVG. `fold` 0 = flat card, 1 = paper Concorde. */
function PaperPlane({
  facetRefs,
  sheenRefs,
  fold = 0,
  question = true,
}: {
  facetRefs?: React.RefObject<Array<SVGPolygonElement | null>>
  sheenRefs?: React.RefObject<Array<SVGPolygonElement | null>>
  fold?: number
  question?: boolean
}) {
  const keelFrom = vertexAt("tail", 1)
  const keelTo = vertexAt("nose", 1)
  return (
    <svg viewBox={`-20 -20 ${CARD_W + 40} ${CARD_H + 40}`} className="relative block h-auto w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="facet-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2e1c" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* One sheet under the facets so no seams show before the fold. */}
      <rect
        width={CARD_W}
        height={CARD_H}
        fill={CARD_FILL}
        style={{ opacity: question ? "calc(1 - var(--fold, 0) * 30)" : 0 }}
      />
      {FACETS.map((facet, i) => (
        <polygon
          key={facet.id}
          ref={(el) => {
            if (facetRefs?.current) facetRefs.current[i] = el
          }}
          points={facetPoints(facet.vertices, fold)}
          fill={mixHex(CARD_FILL, facet.shade, fold)}
          stroke={fold > 0.02 ? "rgba(17,17,17,0.35)" : "none"}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      ))}
      {FACETS.map((facet, i) => (
        <polygon
          key={`${facet.id}-sheen`}
          ref={(el) => {
            if (sheenRefs?.current) sheenRefs.current[i] = el
          }}
          points={facetPoints(facet.vertices, fold)}
          fill="url(#facet-sheen)"
          style={{ opacity: question ? "var(--fold, 0)" : 1 }}
        />
      ))}
      {question ? (
        <g style={{ opacity: "calc(1 - var(--fold, 0) * 4)" }}>
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
        x1={keelFrom[0]}
        y1={keelFrom[1]}
        x2={keelTo[0]}
        y2={keelTo[1]}
        stroke="rgba(17,17,17,0.55)"
        strokeWidth="1"
        strokeLinecap="round"
        style={{ opacity: question ? "calc((var(--fold, 0) - 0.8) * 5)" : 1 }}
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

/** Boarding pass: the sign-up. Tearing the stub opens /sign-up. */
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
      className="relative flex min-h-[100svh] flex-col items-center justify-center gap-8 overflow-hidden bg-paper bg-[image:var(--paper-grain)] px-4 py-24"
    >
      <h2 id="board-heading" className="text-center font-display text-4xl tracking-tight text-ink md:text-6xl">
        Would love to have you on board!
      </h2>
      <div
        className="flex w-full max-w-3xl flex-col sm:flex-row"
        style={{ filter: "drop-shadow(0 1px 0.6px rgb(60 45 20 / 0.2)) drop-shadow(0 18px 30px rgb(60 45 20 / 0.12))" }}
        data-testid="boarding-pass"
      >
        <div className="relative flex-1 rounded-t-md bg-[#fffdf8] bg-[image:var(--paper-grain)] px-6 py-6 sm:rounded-l-md sm:rounded-tr-none md:px-8">
          <div className="flex items-center justify-between gap-4">
            <ConcordLogo size="sm" />
            <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Boarding pass</span>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">From</p>
              <p className="font-display text-5xl leading-none md:text-6xl">CND</p>
              <p className="mt-1 text-sm text-muted-foreground">Candidate</p>
            </div>
            <svg viewBox="0 0 120 20" className="mb-7 hidden w-28 sm:block" aria-hidden>
              <path d="M2 14 Q 60 -4 118 14" fill="none" stroke="#999" strokeWidth="1.2" strokeDasharray="3 4" />
            </svg>
            <div className="text-right">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">To</p>
              <p className="font-display text-5xl leading-none md:text-6xl">OFR</p>
              <p className="mt-1 text-sm text-muted-foreground">Offer</p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-dashed border-stone pt-4 font-mono text-xs sm:grid-cols-4">
            {[
              ["Passenger", "You"],
              ["Flight", "CC 001"],
              ["Gate", "Superday"],
              ["Boarding", "Today"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
                <dd className="mt-0.5 text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <svg viewBox="0 0 200 24" className="mt-5 h-8 w-full" aria-hidden preserveAspectRatio="none">
            {Array.from({ length: 64 }, (_, i) => (
              <rect key={i} x={i * 3.1} y="0" width={(i * 7) % 3 === 0 ? 2 : 1} height="24" fill="#222" />
            ))}
          </svg>
        </div>
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-b-md border-t-2 border-dashed border-stone bg-[#fffdf8] bg-[image:var(--paper-grain)] px-6 py-6 transition-[transform,opacity] duration-[380ms] ease-in sm:w-56 sm:rounded-r-md sm:rounded-bl-none sm:border-t-0 sm:border-l-2 ${torn ? "translate-x-6 translate-y-10 rotate-[9deg] opacity-0" : ""}`}
        >
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Seat 1A</p>
          <Link
            href="/sign-up"
            onClick={tear}
            className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper outline-offset-4 hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-ink"
          >
            {CTA}
          </Link>
          <p className="text-center text-xs text-muted-foreground">Tear here</p>
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

function Headline() {
  return (
    <h1 className="text-center font-display text-5xl leading-[1.02] tracking-tight text-ink md:text-7xl">
      {HEADLINE[0]}
      <br />
      {HEADLINE[1]}
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
        <p className="text-center font-display text-4xl tracking-tight text-[#f7f1e4] md:text-6xl">
          It only takes about 12 minutes a day.
        </p>
        <TallyScrap className="!static w-56" />
      </section>
      <BoardingPass reduced />
    </div>
  )
}

export function PaperConcordeLanding() {
  const reduced = usePrefersReducedMotion()
  const stageRef = React.useRef<HTMLDivElement>(null)
  const facetRefs = React.useRef<Array<SVGPolygonElement | null>>([])
  const sheenRefs = React.useRef<Array<SVGPolygonElement | null>>([])
  const contrailRef = React.useRef<SVGPathElement>(null)

  React.useEffect(() => {
    if (reduced !== false) return
    const stage = stageRef.current
    if (!stage) return
    let frame = 0
    let lastFold = -1

    const render = () => {
      frame = 0
      const rect = stage.getBoundingClientRect()
      const travel = Math.max(1, rect.height - window.innerHeight)
      const p = Math.min(1, Math.max(0, -rect.top / travel))
      const narrow = window.innerWidth < 768

      const fold = segment(p, ...SCENES.fold)
      const takeoff = segment(p, ...SCENES.takeoff)
      const clouds = segment(p, ...SCENES.clouds)
      const cruise = segment(p, ...SCENES.cruise)
      const land = segment(p, ...SCENES.land)
      const sky = skyAt(p)
      const dark = Math.min(segment(p, 0.62, 0.76), 1 - segment(p, 0.9, 0.96))
      const hero = 1 - segment(p, 0.04, 0.1)
      // On phones the product cards sit low, so the plane flies higher past them.
      const lift = narrow ? Math.min(segment(p, 0.36, 0.42), 1 - segment(p, 0.72, 0.78)) : 0

      // Plane path: lift off the desk, climb, level at cruise, glide down to land.
      const scale = 1 - 0.45 * takeoff - 0.12 * clouds - 0.08 * cruise - 0.1 * lift
      const x = 6 * takeoff - 4 * cruise
      const y = -10 * takeoff + 2.5 * Math.sin(clouds * Math.PI * 2) - 2 * cruise + 46 * land - 22 * lift
      const tilt = -14 * takeoff * (1 - cruise) + 10 * land

      const vars: Record<string, string> = {
        "--fold": fold.toFixed(4),
        "--takeoff": takeoff.toFixed(4),
        "--clouds": clouds.toFixed(4),
        "--land": land.toFixed(4),
        "--dark": dark.toFixed(3),
        "--hint": (1 - segment(p, ...SCENES.hint)).toFixed(3),
        "--hero": hero.toFixed(3),
        "--hero-vis": hero > 0.02 ? "visible" : "hidden",
        "--sky-top": sky.top,
        "--sky-bottom": sky.bottom,
        "--plane-x": `${x.toFixed(2)}vw`,
        "--plane-y": `${y.toFixed(2)}vh`,
        "--plane-scale": scale.toFixed(4),
        "--plane-tilt": `${tilt.toFixed(2)}deg`,
        "--plane-opacity": (1 - segment(p, 0.96, 1)).toFixed(3),
        "--skyline-y": `${((1 - segment(p, 0.29, 0.36)) * 100 + segment(p, 0.38, 0.52) * 110).toFixed(2)}%`,
        "--home-y": `${((1 - segment(p, 0.9, 0.99)) * 100).toFixed(2)}%`,
        "--sun": windowOpacity(p, [0.26, 0.54]).toFixed(3),
        "--sun-y": `${(30 - 24 * segment(p, 0.26, 0.5)).toFixed(2)}vh`,
        "--birds": windowOpacity(p, [0.36, 0.58]).toFixed(3),
        "--birds-x": `${(-20 * segment(p, 0.36, 0.58)).toFixed(2)}vw`,
        "--wordmark": windowOpacity(p, [0.27, 0.42]).toFixed(3),
        "--night": windowOpacity(p, [0.7, 0.92]).toFixed(3),
        "--earth": cruise.toFixed(4),
      }
      FEATURES.forEach((feature, i) => {
        vars[`--feature-${i}`] = windowOpacity(p, feature.window).toFixed(3)
      })
      for (const [key, value] of Object.entries(vars)) stage.style.setProperty(key, value)

      if (Math.abs(fold - lastFold) > 0.0005) {
        lastFold = fold
        FACETS.forEach((facet, i) => {
          const points = facetPoints(facet.vertices, fold)
          const el = facetRefs.current[i]
          if (el) {
            el.setAttribute("points", points)
            el.setAttribute("fill", mixHex(CARD_FILL, facet.shade, fold))
            el.setAttribute("stroke", fold > 0.02 ? "rgba(17,17,17,0.35)" : "none")
          }
          sheenRefs.current[i]?.setAttribute("points", points)
        })
      }
      contrailRef.current?.setAttribute("stroke-dashoffset", (1 - segment(p, 0.72, 0.86)).toFixed(4))
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

  return (
    <div className="bg-paper">
      <div ref={stageRef} className="landing-stage relative h-[760svh]" data-testid="landing-stage">
        <div
          className="sticky top-0 h-[100svh] overflow-hidden"
          style={{ background: "linear-gradient(var(--sky-top, #f7f1e4), var(--sky-bottom, #f7f1e4))" }}
        >
          <TornEdgeFilter />

          {/* The desk; drops away on takeoff. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-paper bg-[image:var(--paper-grain)]"
            style={{
              opacity: "calc(1 - var(--takeoff, 0) * 1.4)",
              transform: "translate3d(0, calc(var(--takeoff, 0) * 60vh), 0)",
            }}
          />
          <DeskClutter />

          {/* Dawn: sun and the city falling away below. */}
          <PaperSun
            className="right-[10vw] w-[min(26vw,9rem)]"
            style={{ top: "var(--sun-y, 30vh)", opacity: "var(--sun, 0)" }}
          />
          <Skyline style={{ transform: "translate3d(0, var(--skyline-y, 100%), 0)", willChange: "transform" }} />
          <Birds
            className="top-[16vh] left-[56vw] w-[min(30vw,11rem)]"
            style={{ opacity: "var(--birds, 0)", transform: "translate3d(var(--birds-x, 0), 0, 0)" }}
          />

          {/* Night: stars, moon and the curve of the Earth. */}
          <div aria-hidden className="absolute inset-0" style={{ opacity: "var(--dark, 0)" }}>
            {Array.from({ length: 64 }, (_, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-[#f7f1e4]"
                style={{
                  left: `${(i * 37) % 100}%`,
                  top: `${(i * 53) % 70}%`,
                  width: i % 9 === 0 ? 3 : 2,
                  height: i % 9 === 0 ? 3 : 2,
                  opacity: 0.3 + ((i * 7) % 6) / 10,
                }}
              />
            ))}
            <PaperMoon className="top-[12vh] left-[8vw] w-[min(22vw,7rem)]" />
          </div>
          <div
            aria-hidden
            className="absolute left-1/2 h-[240vw] w-[240vw] rounded-full"
            style={{
              top: "calc(100svh - 18vh)",
              transform: "translate3d(-50%, calc((1 - var(--earth, 0)) * 30vh + var(--land, 0) * 40vh), 0)",
              background: "radial-gradient(circle at 50% 0%, #3d6a9c 0%, #1e3a63 8%, #0d1a33 30%)",
              boxShadow: "0 -6px 30px 4px rgba(150, 200, 255, 0.35)",
              opacity: "calc(var(--earth, 0) * (1 - var(--land, 0) * 2))",
            }}
          />

          {/* Torn-paper clouds, at different depths. */}
          <div aria-hidden className="absolute inset-0">
            {CLOUDS.map((cloud, i) => (
              <TornCloud
                key={i}
                tone={cloud.tone}
                shape={cloud.shape}
                className="absolute"
                style={{
                  left: `${cloud.x}vw`,
                  width: `max(${cloud.w}vw, ${cloud.far ? 7 : 12}rem)`,
                  top: `${cloud.y}vh`,
                  transform: `translate3d(0, calc(var(--clouds, 0) * ${cloud.speed * 520}vh), 0)`,
                  opacity: `calc((1 - var(--dark, 0) * 0.85) * ${cloud.far ? 0.7 : 1})`,
                  willChange: "transform",
                }}
              />
            ))}
          </div>

          {/* Home at dusk: the city comes back up as the plane lands. */}
          <Skyline style={{ transform: "translate3d(0, var(--home-y, 100%), 0)", willChange: "transform" }} />

          {/* Contrail at cruise: a pen line drawn behind the plane. */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ opacity: "calc(var(--dark, 0) * (1 - var(--land, 0) * 3))" }}
          >
            <path
              ref={contrailRef}
              d="M -5 62 C 15 58, 30 50, 46 47"
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
            className="absolute top-1/2 left-1/2 w-[min(80vw,30rem)]"
            style={{
              transform:
                "translate3d(calc(-50% + var(--plane-x, 0vw)), calc(-50% + var(--plane-y, 0vh)), 0) rotate(var(--plane-tilt, 0deg)) scale(var(--plane-scale, 1))",
              opacity: "var(--plane-opacity, 1)",
              filter: "drop-shadow(0 14px 22px rgb(30 40 70 / 0.18))",
              willChange: "transform",
            }}
          >
            <CardStack />
            <PaperPlane facetRefs={facetRefs} sheenRefs={sheenRefs} />
          </div>

          {/* Hero copy. */}
          <div
            className="pointer-events-none absolute inset-x-4 top-[12vh] md:top-[11vh]"
            style={{ opacity: "var(--hero, 1)", transform: "translate3d(0, calc((1 - var(--hero, 1)) * -4vh), 0)" }}
          >
            <Headline />
          </div>
          <div
            className="absolute inset-x-4 bottom-[8vh] flex flex-col items-center gap-4"
            style={{
              opacity: "var(--hero, 1)",
              visibility: "var(--hero-vis, visible)" as React.CSSProperties["visibility"],
            }}
          >
            <p className="max-w-md text-center text-base text-ink md:text-lg">{SUBHEAD}</p>
            <CtaButton />
          </div>
          <p
            aria-hidden
            className="absolute inset-x-0 bottom-3 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase"
            style={{ opacity: "var(--hint, 1)" }}
          >
            Scroll
          </p>

          <p
            aria-hidden
            className="absolute inset-x-0 top-[16vh] text-center font-display text-7xl tracking-tight text-ink md:text-9xl"
            style={{ opacity: "var(--wordmark, 0)" }}
          >
            Concord
          </p>

          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={`absolute bottom-[5vh] left-1/2 w-[min(88vw,25rem)] -translate-x-1/2 md:top-1/2 md:bottom-auto md:translate-x-0 ${feature.side === "left" ? "md:left-[6vw]" : "md:right-[6vw] md:left-auto"}`}
              style={{ opacity: `var(--feature-${i}, 0)` }}
            >
              <div className="md:-translate-y-1/2">
                <div
                  style={{
                    transform: `translate3d(0, calc((1 - var(--feature-${i}, 0)) * 6vh), 0) rotate(${i % 2 ? 1.5 : -1.5}deg)`,
                  }}
                >
                  <Feature title={feature.title} Card={feature.Card} />
                </div>
              </div>
            </div>
          ))}

          <p
            className="absolute inset-x-4 top-[18vh] text-center font-display text-4xl tracking-tight text-[#f7f1e4] md:text-6xl"
            style={{ opacity: "var(--night, 0)" }}
          >
            It only takes about 12 minutes a day.
          </p>
          <TallyScrap
            className="right-[6vw] bottom-[14vh] w-[min(56vw,15rem)] rotate-[-3deg]"
            style={{ opacity: "var(--night, 0)" }}
          />
          <p
            aria-hidden
            className="absolute bottom-6 left-6 font-mono text-[11px] tracking-[0.18em] text-[#f7f1e4]/80 uppercase"
            style={{ opacity: "var(--night, 0)" }}
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
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-lg bg-[#fffdf8]/90 bg-[image:var(--paper-grain)] py-2 pr-2 pl-4 shadow-[0_1px_0_rgb(60_45_20/0.12),0_8px_20px_rgb(30_40_70/0.12)] backdrop-blur-sm">
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
