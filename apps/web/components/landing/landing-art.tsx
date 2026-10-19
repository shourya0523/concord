/**
 * Landing art (DESIGN.md §17): everything on the desk and in the sky, drawn
 * as paper — index cards, a pencil, a coffee ring, a paper-cut skyline, a
 * torn-paper sun and moon, and the three product cards the plane flies past.
 * Pure SVG / CSS; motion comes from custom properties set on the stage.
 */
import * as React from "react"
import { Caveat } from "next/font/google"

import { Paperclip } from "@/components/paper"
import { DESK_ITEMS, deskTransform, type DeskItem } from "@/lib/landing/scroll-frame"

export const hand = Caveat({ subsets: ["latin"], weight: ["500", "700"] })

const INK_BLUE = "#1d2a4a"
const RED_PEN = "#b4372f"

/** Deckled edge for torn paper: displaces each shape's outline by fibre noise. */
export function TornEdgeFilter() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id="landing-torn" x="-5%" y="-10%" width="110%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="3" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="landing-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

/* ------------------------------------------------------------------ desk */

/** A loose index card on the desk with a handwritten question. */
type ItemProps<E extends Element> = { className?: string; style?: React.CSSProperties; ref?: React.Ref<E> }

function LooseCard({ question, className, style, ref }: { question: string } & ItemProps<HTMLDivElement>) {
  return (
    <div ref={ref} className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <div className="stock-index h-full w-full px-4 pt-3 [filter:drop-shadow(0_6px_10px_rgb(60_45_20/0.14))]">
        <p className="font-mono text-[9px] tracking-[0.18em] text-[#777] uppercase">Question</p>
        <p className={`${hand.className} pt-5 text-[1.5rem] leading-tight`} style={{ color: INK_BLUE }}>
          {question}
        </p>
      </div>
    </div>
  )
}

function Pencil({ className, style, ref }: ItemProps<SVGSVGElement>) {
  return (
    <svg ref={ref} viewBox="0 0 320 28" className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <defs>
        <linearGradient id="pencil-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c94a" />
          <stop offset="0.45" stopColor="#e9b52c" />
          <stop offset="0.55" stopColor="#d9a21f" />
          <stop offset="1" stopColor="#c08a14" />
        </linearGradient>
        <linearGradient id="pencil-ferrule" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9d6cf" />
          <stop offset="0.5" stopColor="#a8a49b" />
          <stop offset="1" stopColor="#8a867e" />
        </linearGradient>
      </defs>
      <g style={{ filter: "drop-shadow(0 5px 4px rgb(60 45 20 / 0.25))" }}>
        <rect x="6" y="5" width="30" height="18" rx="5" fill="#e48a8a" />
        <rect x="30" y="4" width="22" height="20" fill="url(#pencil-ferrule)" />
        {[35, 41, 47].map((x) => (
          <line key={x} x1={x} y1="4" x2={x} y2="24" stroke="#7c786f" strokeWidth="1" />
        ))}
        <rect x="52" y="4" width="210" height="20" fill="url(#pencil-body)" />
        <line x1="52" y1="11" x2="262" y2="11" stroke="#c99a1d" strokeWidth="0.8" />
        <line x1="52" y1="17" x2="262" y2="17" stroke="#b9870f" strokeWidth="0.8" />
        <text x="90" y="17.5" fontSize="8" fontFamily="ui-monospace, monospace" fill="#5e4708" letterSpacing="1.5">
          CONCORD · HB
        </text>
        <path d="M262 4 L304 14 L262 24 Z" fill="#e8c9a0" />
        <path d="M262 4 Q 266 14 262 24" fill="none" stroke="#c9a676" strokeWidth="1" />
        <path d="M292 11.2 L314 14 L292 16.8 Z" fill="#3a3a3a" />
      </g>
    </svg>
  )
}

/** Coffee ring left by a mug: two broken, uneven brown circles. */
function CoffeeRing({ className, style, ref }: ItemProps<SVGSVGElement>) {
  return (
    <svg ref={ref} viewBox="0 0 200 200" className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <g fill="none" stroke="#8a5a2b" strokeLinecap="round" filter="url(#landing-torn)">
        <path d="M100 18 A 82 80 0 1 1 30 64" strokeWidth="5" opacity="0.22" />
        <path d="M100 26 A 74 73 0 0 1 172 112" strokeWidth="2.5" opacity="0.16" />
        <path d="M60 170 A 76 74 0 0 1 24 92" strokeWidth="3" opacity="0.14" />
      </g>
      <circle cx="100" cy="100" r="78" fill="#8a5a2b" opacity="0.035" />
    </svg>
  )
}

function StickyNote({ className, style, ref }: ItemProps<HTMLDivElement>) {
  return (
    <div ref={ref} className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <div className="relative h-full w-full bg-[#f8e58c] bg-[image:var(--paper-grain)] p-4 [filter:drop-shadow(0_8px_8px_rgb(60_45_20/0.18))] [clip-path:polygon(0_0,100%_0,100%_88%,90%_100%,0_100%)]">
        <div className="absolute inset-x-0 top-0 h-5 bg-[#efd876]" />
        <p className={`${hand.className} relative pt-4 text-[1.55rem] leading-[1.05]`} style={{ color: INK_BLUE }}>
          Superday
          <br />
          Thursday!
        </p>
        <p className={`${hand.className} relative mt-1 text-lg`} style={{ color: RED_PEN }}>
          know your LBO
        </p>
      </div>
    </div>
  )
}

/** Corner of a ledger pad with a few worked numbers. */
function LedgerCorner({ className, style, ref }: ItemProps<HTMLDivElement>) {
  return (
    <div ref={ref} className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <div className="stock-ledger h-full w-full px-6 pt-6 [filter:drop-shadow(0_8px_12px_rgb(60_45_20/0.16))]">
        <div className={`${hand.className} space-y-1 text-right text-[1.35rem] leading-7`} style={{ color: INK_BLUE }}>
          <p>EBITDA 120</p>
          <p>× 8.5x</p>
          <p className="border-b border-current">= 1,020</p>
          <p>– net debt 300</p>
          <p className="font-bold">= 720 equity</p>
        </div>
      </div>
    </div>
  )
}

type Bind = (key: string) => (el: HTMLElement | SVGElement | null) => void

/**
 * Everything else on the desk. The stage moves each item (and fades the
 * group) by writing transforms through `bind`; nothing here re-renders.
 */
export function DeskClutter({ bind }: { bind: Bind }) {
  const item = (key: DeskItem["key"]) => {
    const spec = DESK_ITEMS.find((d) => d.key === key)!
    return {
      ref: bind(key),
      style: { transform: deskTransform(spec, 0, 0), willChange: "transform" } as React.CSSProperties,
    }
  }
  return (
    <div ref={bind("desk")} aria-hidden className="pointer-events-none absolute inset-0 will-change-[opacity]">
      {/* intro-drop: each item is tossed onto the desk from its own side (landing-intro.css). */}
      <CoffeeRing
        className="intro-drop desk-ring pointer-events-auto top-[6vh] left-[4vw] w-[22vw] max-w-72 min-w-40 [--intro-delay:900ms] [--intro-r:0deg] [--intro-y:0]"
        {...item("desk-ring")}
      />
      <LedgerCorner
        className="intro-drop desk-lift pointer-events-auto top-[54vh] -left-[3vw] hidden h-[18rem] w-[17rem] [--intro-delay:180ms] [--intro-r:-14deg] [--intro-x:-40vw] [--intro-y:8vh] md:block"
        {...item("desk-ledger")}
      />
      <LooseCard
        question="Why private equity?"
        className="intro-drop desk-flutter pointer-events-auto top-[12vh] right-[5vw] hidden h-[10.5rem] w-[17rem] [--intro-delay:260ms] [--intro-r:18deg] [--intro-x:36vw] [--intro-y:-20vh] lg:block"
        {...item("desk-card-pe")}
      />
      <LooseCard
        question="What's EBITDA?"
        className="intro-drop desk-flutter pointer-events-auto top-[58vh] right-[9vw] hidden h-[10rem] w-[16rem] [--intro-delay:380ms] [--intro-r:-12deg] [--intro-x:40vw] [--intro-y:12vh] md:block"
        {...item("desk-card-ebitda")}
      />
      <StickyNote
        className="intro-drop desk-peel pointer-events-auto top-[18vh] left-[10vw] hidden h-40 w-40 [--intro-delay:480ms] [--intro-r:-20deg] [--intro-x:-30vw] [--intro-y:-30vh] lg:block"
        {...item("desk-sticky")}
      />
      <Pencil
        className="intro-drop desk-pencil pointer-events-auto right-[-4vw] bottom-[12vh] w-[min(62vw,22rem)] [--intro-delay:620ms] [--intro-r:40deg] [--intro-x:60vw] [--intro-y:6vh] md:right-[18vw] md:bottom-[9vh]"
        {...item("desk-pencil")}
      />
    </div>
  )
}

/** The paperclip and the stack under the hero card; gone once folding starts. */
export function CardStack({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-[7%_4.5%] translate-x-[2%] translate-y-[4%] rotate-[3deg] rounded-[4px] bg-[#f3efe6] [filter:drop-shadow(0_4px_6px_rgb(60_45_20/0.12))]" />
      <div className="absolute inset-[7%_4.5%] -translate-x-[1.5%] translate-y-[2%] -rotate-[2deg] rounded-[4px] bg-[#f8f5ee] [filter:drop-shadow(0_4px_6px_rgb(60_45_20/0.12))]" />
      <Paperclip className="hero-clip absolute top-[1%] left-[12%] z-10 h-[52px] w-[19px] rotate-[4deg]" />
    </div>
  )
}

/* ------------------------------------------------------------------- sky */

const SKYLINE_FAR = [
  [0, 70], [40, 120], [70, 96], [104, 150], [140, 110], [176, 180], [214, 128], [250, 160], [292, 104],
  [330, 140], [368, 210], [404, 130], [446, 170], [486, 118], [520, 196], [560, 140], [600, 160],
  [640, 112], [680, 176], [720, 128], [760, 150], [800, 100],
] as const
const SKYLINE_NEAR = [
  { x: 20, w: 60, h: 150 }, { x: 86, w: 44, h: 220, spire: true }, { x: 136, w: 70, h: 120 },
  { x: 214, w: 52, h: 270 }, { x: 272, w: 80, h: 170 }, { x: 360, w: 46, h: 320, spire: true },
  { x: 412, w: 74, h: 210 }, { x: 494, w: 58, h: 250 }, { x: 560, w: 86, h: 140 },
  { x: 654, w: 48, h: 230, spire: true }, { x: 710, w: 70, h: 180 }, { x: 786, w: 40, h: 120 },
]

/**
 * Two layers of paper-cut towers. Windows are SVG patterns (one dim grid and
 * one sparse lit grid per tower) rather than a rect per window.
 */
export function Skyline({ ref, style }: { ref?: React.Ref<HTMLDivElement>; style?: React.CSSProperties }) {
  const uid = React.useId().replace(/:/g, "")
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 will-change-transform" style={style}>
      <svg viewBox="0 0 840 360" preserveAspectRatio="xMidYMax slice" className="block h-[46vh] w-full">
        <defs>
          {SKYLINE_NEAR.map((b, i) => {
            const x = b.x + 7
            const y = 360 - b.h + 12
            const litCol = (i * 2) % 3
            const litRow = (i * 5) % 4
            return (
              <React.Fragment key={b.x}>
                <pattern id={`${uid}-dim-${i}`} x={x} y={y} width="12" height="18" patternUnits="userSpaceOnUse">
                  <rect width="5" height="8" fill="rgb(70 52 30 / 0.28)" />
                </pattern>
                <pattern id={`${uid}-lit-${i}`} x={x} y={y} width="36" height="72" patternUnits="userSpaceOnUse">
                  <rect x={litCol * 12} y={litRow * 18} width="5" height="8" fill="#ffd98a" />
                  <rect x={((litCol + 1) % 3) * 12} y={((litRow + 2) % 4) * 18} width="5" height="8" fill="#ffd98a" />
                </pattern>
              </React.Fragment>
            )
          })}
        </defs>
        <path
          filter="url(#landing-torn)"
          fill="#d9c7a6"
          d={`M0 360 ${SKYLINE_FAR.map(([x, h], i) => `L${x} ${360 - h} L${(SKYLINE_FAR[i + 1]?.[0] ?? 840) - 4} ${360 - h}`).join(" ")} L840 360 Z`}
        />
        {SKYLINE_NEAR.map((b, i) => {
          const cols = Math.floor((b.w - 10) / 12)
          const rows = Math.floor((b.h - 20) / 18)
          const win = { x: b.x + 7, y: 360 - b.h + 12, width: cols * 12 - 7, height: rows * 18 - 10 }
          return (
            <g key={b.x}>
              {b.spire ? <rect x={b.x + b.w / 2 - 1.5} y={360 - b.h - 34} width="3" height="34" fill="#a88c62" /> : null}
              <rect x={b.x - 2} y={360 - b.h + 2} width={b.w} height={b.h} fill="rgb(60 45 20 / 0.14)" />
              <rect x={b.x} y={360 - b.h} width={b.w} height={b.h} fill={i % 2 ? "#c2a77d" : "#b89a6c"} />
              <rect x={b.x} y={360 - b.h} width={b.w * 0.22} height={b.h} fill="rgb(255 255 255 / 0.12)" />
              <rect {...win} fill={`url(#${uid}-dim-${i})`} />
              <rect {...win} fill={`url(#${uid}-lit-${i})`} />
            </g>
          )
        })}
        <rect x="0" y="352" width="840" height="8" fill="#9c8058" />
      </svg>
    </div>
  )
}

/** A sun torn out of orange paper, with a paler rim. */
export function PaperSun({ className, style, ref }: ItemProps<SVGSVGElement>) {
  return (
    <svg ref={ref} viewBox="0 0 120 120" className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <g filter="url(#landing-torn)">
        <circle cx="60" cy="60" r="52" fill="#fbe2c4" />
        <circle cx="60" cy="60" r="47" fill="#f1a35f" />
        <circle cx="52" cy="50" r="30" fill="#f6b877" opacity="0.6" />
      </g>
    </svg>
  )
}

/** A crescent moon torn out of cream paper. */
export function PaperMoon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={`absolute overflow-visible [filter:drop-shadow(0_0_18px_rgb(255_236_190/0.35))] ${className ?? ""}`}
      style={style}
      aria-hidden
    >
      <defs>
        <mask id="moon-cut">
          <rect width="120" height="120" fill="#fff" />
          <circle cx="80" cy="46" r="44" fill="#000" />
        </mask>
      </defs>
      <g filter="url(#landing-torn)" mask="url(#moon-cut)">
        <circle cx="56" cy="60" r="48" fill="#fffaf0" />
        <circle cx="56" cy="60" r="44" fill="#f2ead8" />
        {[
          [26, 72, 6],
          [38, 94, 4.5],
          [19, 50, 3.5],
          [52, 103, 3],
          [30, 86, 2],
        ].map(([cx, cy, r]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={r} fill="#e2d8c0" />
            <path d={`M${cx! - r!} ${cy} a ${r} ${r} 0 0 1 ${r! * 2} 0`} fill="none" stroke="#cfc3a6" strokeWidth="0.8" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/** A few ink birds, drawn with a pen. */
export function Birds({ className, style, ref }: ItemProps<SVGSVGElement>) {
  const birds = [
    [10, 30, 1], [34, 18, 0.8], [52, 34, 0.7], [70, 12, 0.6], [86, 26, 0.5],
  ] as const
  return (
    <svg ref={ref} viewBox="0 0 100 50" className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      {birds.map(([x, y, s]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x - 6 * s} ${y - 2 * s} Q ${x - 3 * s} ${y - 5 * s} ${x} ${y} Q ${x + 3 * s} ${y - 5 * s} ${x + 6 * s} ${y - 2 * s}`}
          fill="none"
          stroke="#2a3550"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/** Cloud silhouettes in a 200×90 box: puffs [cx, cy, r] over a flat base. */
const CLOUD_SHAPES: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[42, 62, 20], [78, 44, 30], [120, 40, 32], [156, 56, 22], [180, 68, 12]],
  [[30, 66, 14], [62, 50, 24], [104, 36, 34], [146, 52, 26], [176, 64, 16]],
  [[48, 58, 24], [92, 42, 30], [138, 50, 26], [170, 66, 14]],
]

function CloudShape({ shape }: { shape: number }) {
  const puffs = CLOUD_SHAPES[shape % CLOUD_SHAPES.length]!
  const left = puffs[0]![0] - puffs[0]![2]
  const right = puffs[puffs.length - 1]![0] + puffs[puffs.length - 1]![2]
  return (
    <>
      {puffs.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
      <rect x={left} y={60} width={right - left} height={20} rx={10} />
    </>
  )
}

/** A cloud torn out of paper: a white fibre rim, the tinted sheet, a shaded underside. */
export function TornCloud({
  ref,
  tone,
  rim = "#fffefb",
  shape,
  className,
  style,
}: {
  ref?: React.Ref<HTMLDivElement>
  tone: string
  rim?: string
  shape: number
  className?: string
  style?: React.CSSProperties
}) {
  const id = `cloud-shade-${shape}`
  return (
    <div ref={ref} className={className} style={style} aria-hidden>
      <svg
        viewBox="0 0 200 90"
        className="block h-auto w-full overflow-visible [filter:drop-shadow(0_10px_14px_rgb(30_40_70/0.16))]"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#2b3a5a" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <g filter="url(#landing-torn)" fill={rim} transform="translate(-1.5 -1.5) scale(1.015)">
          <CloudShape shape={shape} />
        </g>
        <g filter="url(#landing-torn)" fill={tone}>
          <CloudShape shape={shape} />
        </g>
        <g filter="url(#landing-torn)" fill={`url(#${id})`}>
          <CloudShape shape={shape} />
        </g>
      </svg>
    </div>
  )
}

/* -------------------------------------------------------- product cards */

const HEAT_ROWS = [
  { topic: "Accounting", cells: [3, 2, 3, 1] },
  { topic: "Valuation", cells: [3, 3, 2, 3] },
  { topic: "M&A", cells: [2, 3, 1, 2] },
  { topic: "LBO", cells: [1, 2, 3, 3] },
  { topic: "Markets", cells: [2, 1, 1, 2] },
] as const
const HEAT_FILL = ["#f7f1e4", "#d9d0bf", "#a89c86", "#4b4438"]

/** Manila folder: which topics each firm type asks about most. */
export function HeatCard() {
  return (
    <div className="relative">
      <div className="stock-manila relative rounded-md px-5 pt-9 pb-5">
        <span className="absolute top-[3px] left-[7%] font-mono text-[9px] tracking-[0.16em] text-[#5c4a22] uppercase">
          Firm intel
        </span>
        <div className="grid grid-cols-[6rem_repeat(4,1fr)] items-center gap-1.5 font-mono text-[10px] text-[#5c4a22]">
          <span />
          {["BB", "EB", "MM", "PE"].map((col) => (
            <span key={col} className="text-center tracking-[0.14em]">
              {col}
            </span>
          ))}
          {HEAT_ROWS.map((row) => (
            <React.Fragment key={row.topic}>
              <span className="truncate text-[11px]">{row.topic}</span>
              {row.cells.map((level, i) => (
                <span
                  key={i}
                  className="h-6 rounded-[3px] border border-[#5c4a22]/40"
                  style={{ backgroundColor: HEAT_FILL[level] }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
        <p className={`${hand.className} mt-3 text-right text-lg`} style={{ color: RED_PEN }}>
          valuation comes up everywhere ↑
        </p>
      </div>
    </div>
  )
}

/** Index card with a typed answer, red-pen ticks and a grade stamp. */
export function GradedCard() {
  return (
    <div className="stock-index relative rounded-md px-5 pt-3 pb-6">
      <p className="font-mono text-[9px] tracking-[0.18em] text-[#777] uppercase">Your answer</p>
      <p className={`${hand.className} pt-5 text-[1.6rem] leading-tight`} style={{ color: INK_BLUE }}>
        Walk me through a DCF.
      </p>
      <ul className="mt-2 space-y-[9px]">
        {[
          ["Project unlevered free cash flow", true],
          ["Discount at WACC", true],
          ["Add terminal value", false],
        ].map(([line, ok]) => (
          <li key={String(line)} className="flex items-center gap-2 font-mono text-[11px] text-[#333]">
            <span className={`${hand.className} w-4 text-xl leading-none`} style={{ color: RED_PEN }}>
              {ok ? "✓" : "?"}
            </span>
            {line}
          </li>
        ))}
      </ul>
      <p className={`${hand.className} mt-2 text-lg`} style={{ color: RED_PEN }}>
        Good. Say how you get terminal value.
      </p>
      <div
        className="absolute -top-4 -right-3 rotate-[10deg] rounded-[4px] border-[2.5px] px-2.5 py-1 text-center font-mono [filter:url(#landing-ink)]"
        style={{ borderColor: RED_PEN, color: RED_PEN }}
      >
        <span className="block text-[12px] font-semibold tracking-[0.18em] uppercase">Proficient</span>
        <span className="block text-[9px] tracking-[0.12em]">8.5 / 10</span>
      </div>
    </div>
  )
}

/** Ledger pad of mental-math drills with times. */
export function DrillCard() {
  const rows = [
    ["15% of 240", "36", "3.1s"],
    ["$1.2bn ÷ 8x", "$150m", "4.0s"],
    ["2x in 5 yrs, IRR", "≈15%", "5.2s"],
    ["$80m × 1.25", "$100m", "2.4s"],
  ] as const
  return (
    <div className="stock-ledger relative rounded-[3px] px-5 pt-4 pb-5">
      <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.18em] text-[#3f5a45] uppercase">
        <span>Drill set</span>
        <span>4 / 4</span>
      </div>
      <table className="mt-3 w-full">
        <tbody>
          {rows.map(([q, a, t]) => (
            <tr key={q} className={`${hand.className} text-[1.3rem] leading-8`} style={{ color: INK_BLUE }}>
              <td>{q}</td>
              <td className="text-right">= {a}</td>
              <td className="w-8 text-center text-xl" style={{ color: RED_PEN }}>
                ✓
              </td>
              <td className="w-10 text-right font-mono text-[10px] text-[#3f5a45]">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Streak tallies on a torn scrap, in pen. */
export function TallyScrap({ className, style, ref }: ItemProps<HTMLDivElement>) {
  const groups = 4
  return (
    <div ref={ref} className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <div className="paper-torn bg-[#f7f1e4] bg-[image:var(--paper-grain)] px-5 py-5 [--torn-h:8px] [filter:drop-shadow(0_8px_14px_rgb(0_0_0/0.3))]">
        <svg viewBox="0 0 200 44" className="block w-full">
          {Array.from({ length: groups }, (_, g) => (
            <g key={g} transform={`translate(${g * 48 + 6} 6)`} stroke={INK_BLUE} strokeWidth="2" strokeLinecap="round">
              {[0, 1, 2, 3].map((i) => (
                <path key={i} d={`M${i * 8 + 2} ${1 + (i % 2)} q 1 15 0 30`} fill="none" />
              ))}
              <path d="M-2 26 L 34 6" fill="none" />
            </g>
          ))}
          <g transform="translate(198 6)" stroke={INK_BLUE} strokeWidth="2" strokeLinecap="round">
            <path d="M-6 1 q 1 15 0 30" fill="none" />
          </g>
        </svg>
        <p className={`${hand.className} mt-1 text-right text-xl`} style={{ color: INK_BLUE }}>
          day 21
        </p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- night */

type Star = readonly [number, number, number?]

/** Market constellations: [x, y, size?] stars and the pencil lines joining them. */
const BULL: { stars: Star[]; lines: Array<readonly [number, number]> } = {
  // Charging left: horns, head, muzzle, neck, back, tail, rump, legs, belly, chest.
  stars: [
    [20, 16, 2.4], [40, 8], [30, 40, 3], [12, 54], [54, 34], [100, 28, 2.6], [150, 32], [176, 28],
    [192, 48], [168, 54, 2.4], [162, 98], [110, 72], [48, 64], [54, 100],
  ],
  lines: [
    [0, 2], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [6, 7], [7, 8], [6, 9], [9, 10], [9, 11], [11, 12],
    [12, 13], [12, 2],
  ],
}
const BEAR: { stars: Star[]; lines: Array<readonly [number, number]> } = {
  // Walking right: tail, rump, back, hump, neck, ear, head, snout, jaw, chest, legs, belly.
  stars: [
    [14, 46], [30, 40, 2.4], [70, 30], [110, 26, 2.8], [140, 38], [158, 24], [168, 34], [190, 50, 2.4],
    [176, 60], [154, 64], [150, 96], [80, 70], [36, 94],
  ],
  lines: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 4], [9, 10], [9, 11],
    [11, 1], [1, 12],
  ],
}

function Constellation({
  shape,
  label,
  className,
  style,
}: {
  shape: { stars: Star[]; lines: Array<readonly [number, number]> }
  label: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 200 116" className={`absolute overflow-visible ${className ?? ""}`} style={style} aria-hidden>
      <g stroke="#f7f1e4" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 3" strokeLinecap="round">
        {shape.lines.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={shape.stars[a]![0]} y1={shape.stars[a]![1]} x2={shape.stars[b]![0]} y2={shape.stars[b]![1]} />
        ))}
      </g>
      {shape.stars.map(([x, y, r = 1.7]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={r * 2.6} fill="#fff6dc" opacity="0.12" />
          <circle cx={x} cy={y} r={r} fill="#fff6dc" />
        </g>
      ))}
      <text x="100" y="116" textAnchor="middle" className={hand.className} fontSize="15" fill="#f7f1e4" opacity="0.7">
        {label}
      </text>
    </svg>
  )
}

export function NightSky() {
  return (
    <>
      <Constellation
        shape={BULL}
        label="the bull"
        className="top-[29vh] right-[3vw] w-[min(30vw,15rem)] md:top-[11vh] md:right-[5vw]"
      />
      <Constellation shape={BEAR} label="the bear" className="top-[33vh] left-[5vw] hidden w-[13rem] md:block" />
    </>
  )
}

/** A pencil streak that crosses the sky once. */
export function ShootingStar({ style, ref }: Omit<ItemProps<SVGSVGElement>, "className">) {
  return (
    <svg ref={ref} viewBox="0 0 160 60" className="absolute top-[6vh] right-[24vw] w-40" style={style} aria-hidden>
      <defs>
        <linearGradient id="shoot-tail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M4 8 L148 52" stroke="url(#shoot-tail)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="148" cy="52" r="2.2" fill="#fff6dc" />
    </svg>
  )
}

/** A far-off paper plane with a blinking wingtip light: other candidates, also prepping. */
export function DistantPlane({ className, style, ref }: ItemProps<SVGSVGElement>) {
  return (
    <svg ref={ref} viewBox="0 0 60 26" className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <path d="M2 4 L58 13 L18 13 Z" fill="#e9e1cf" />
      <path d="M2 22 L58 13 L18 13 Z" fill="#cfc6b2" />
      <path d="M8 13 L58 13 L18 16 Z" fill="#bdb39d" />
      <circle cx="3" cy="4.5" r="1.4" fill="#ff6b5e" className="motion-safe:animate-pulse" />
    </svg>
  )
}

/**
 * The curve of the Earth at cruise, with warm city lights along the horizon.
 * A short SVG band (not a giant disc) so it stays cheap to composite.
 */
export function Earth({ ref, style }: { ref?: React.Ref<HTMLDivElement>; style?: React.CSSProperties }) {
  const uid = React.useId().replace(/:/g, "")
  // Horizon: a circle of radius R centred far below; top of the arc at y = 60.
  const R = 3000
  const cy = 60 + R
  const horizon = (x: number) => cy - Math.sqrt(R * R - (x - 500) ** 2)
  const cities = [
    [80, 4], [170, 7], [260, 3], [330, 9], [410, 5], [470, 12], [550, 6], [620, 10], [700, 4], [770, 8],
    [860, 5], [930, 3],
  ] as const
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 will-change-[transform,opacity]" style={style}>
      <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMin slice" className="block h-[34vh] w-full">
        <defs>
          <radialGradient id={`${uid}-ground`} cx="500" cy="60" r="900" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3d6a9c" />
            <stop offset="0.12" stopColor="#1e3a63" />
            <stop offset="0.6" stopColor="#0d1a33" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <circle cx="500" cy={cy} r={R} fill="none" stroke="rgb(150 200 255 / 0.45)" strokeWidth="18" filter={`url(#${uid}-glow)`} />
        <circle cx="500" cy={cy} r={R} fill={`url(#${uid}-ground)`} />
        {cities.flatMap(([cx, n], c) =>
          Array.from({ length: n }, (_, i) => {
            const x = cx + ((i * 37 + c * 11) % 17) * 1.6 - 14
            const y = horizon(x) + 7 + ((i * 53 + c * 7) % 13) * 1.1
            return (
              <circle
                key={`${c}-${i}`}
                cx={x}
                cy={y}
                r={i % 4 === 0 ? 2.2 : 1.4}
                fill="#ffd98a"
                opacity={0.45 + ((i * 7 + c) % 5) / 10}
              />
            )
          })
        )}
      </svg>
    </div>
  )
}

/** Today's set as a luggage tag: what the 12 minutes is made of. */
export function DailySetTag({ className, style, ref }: ItemProps<HTMLDivElement>) {
  const rows = [
    ["Reviews due", "4"],
    ["New questions", "2"],
    ["From your target firm", "1"],
    ["Math drill", "1"],
  ] as const
  return (
    <div ref={ref} className={`absolute ${className ?? ""}`} style={style} aria-hidden>
      <div className="relative bg-[#f1e3c2] bg-[image:var(--paper-grain)] px-5 pt-7 pb-4 [clip-path:polygon(14%_0,86%_0,100%_9%,100%_100%,0_100%,0_9%)] [filter:drop-shadow(0_10px_16px_rgb(0_0_0/0.35))]">
        <span className="absolute top-2 left-1/2 size-3 -translate-x-1/2 rounded-full bg-[#1b2440] ring-2 ring-[#d9c79e]" />
        <p className="text-center font-mono text-[9px] tracking-[0.2em] text-[#6b5a35] uppercase">Today&apos;s set</p>
        <ul className="mt-2 space-y-1">
          {rows.map(([label, n]) => (
            <li key={label} className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-[#3b3122]">
              <span>{label}</span>
              <span className={`${hand.className} text-lg leading-none`} style={{ color: INK_BLUE }}>
                {n}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-baseline justify-between border-t border-dashed border-[#6b5a35]/50 pt-2 font-mono text-[11px] text-[#3b3122]">
          <span>8 cards</span>
          <span className={`${hand.className} text-xl leading-none`} style={{ color: RED_PEN }}>
            ≈ 12 min
          </span>
        </p>
      </div>
    </div>
  )
}
