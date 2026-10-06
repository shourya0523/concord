/**
 * Landing scroll choreography (DESIGN.md §17) as a pure function: scroll
 * progress in, the opacity / transform of every animated piece out. The stage
 * writes these straight onto ~40 elements (and only when a value changes), so
 * a frame never restyles the rest of the page.
 */
import { SKY_STOPS, segment, skyBlend } from "./plane-geometry"

/** Scene windows along the stage's scroll progress (0–1). */
export const SCENES = {
  hint: [0, 0.05],
  fold: [0.07, 0.24],
  takeoff: [0.24, 0.4],
  clouds: [0.34, 0.76],
  cruise: [0.7, 0.88],
  land: [0.88, 1],
} as const

/** When each product card is on screen. */
export const FEATURE_WINDOWS = [
  [0.4, 0.53],
  [0.51, 0.64],
  [0.62, 0.75],
] as const

/** Torn-paper clouds: x (vw), width (vw), depth (scroll speed), start offset (vh), silhouette. */
export const CLOUDS = [
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

/** Desk items: how far each drifts while the card folds and slides off on takeoff. */
export const DESK_ITEMS = [
  { key: "desk-ring", speed: -2, rotate: 0 },
  { key: "desk-ledger", speed: -4, rotate: -7 },
  { key: "desk-card-pe", speed: 5, rotate: 8 },
  { key: "desk-card-ebitda", speed: 3, rotate: -5 },
  { key: "desk-sticky", speed: -3, rotate: -4 },
  { key: "desk-pencil", speed: 6, rotate: -16 },
] as const

export type DeskItem = (typeof DESK_ITEMS)[number]

export function deskTransform(item: DeskItem, fold: number, takeoff: number): string {
  const x = fold * item.speed * 0.6
  const y = takeoff * (70 + item.speed * 20)
  return `translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0) rotate(${item.rotate}deg)`
}

/** Fade in over the first quarter of a window and out over the last quarter. */
export function windowOpacity(p: number, [start, end]: readonly [number, number]): number {
  const fadeIn = segment(p, start, start + (end - start) * 0.25)
  const fadeOut = 1 - segment(p, end - (end - start) * 0.25, end)
  return Math.min(fadeIn, fadeOut)
}

export type PieceStyle = { opacity?: number; transform?: string }

export type Frame = {
  /** 0 = flat index card, 1 = paper Concorde. */
  fold: number
  /** Contrail stroke-dashoffset on a pathLength of 1 (1 = not drawn yet). */
  contrail: number
  /** Keyed by the `data-piece` names the stage binds. */
  pieces: Record<string, PieceStyle>
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const t3 = (x: number, y: number, unitX = "vw", unitY = "vh") =>
  `translate3d(${x.toFixed(2)}${unitX}, ${y.toFixed(2)}${unitY}, 0)`

/** Everything the stage shows at scroll progress `p`. `narrow` = phone layout. */
export function frameAt(p: number, narrow: boolean): Frame {
  const fold = segment(p, ...SCENES.fold)
  const takeoff = segment(p, ...SCENES.takeoff)
  const clouds = segment(p, ...SCENES.clouds)
  const cruise = segment(p, ...SCENES.cruise)
  const land = segment(p, ...SCENES.land)
  const dark = Math.min(segment(p, 0.62, 0.76), 1 - segment(p, 0.9, 0.96))
  const hero = 1 - segment(p, 0.04, 0.1)
  const night = windowOpacity(p, [0.7, 0.92])
  const drift = segment(p, 0.68, 0.92)
  // On phones the product cards sit low, so the plane flies higher past them.
  const lift = narrow ? Math.min(segment(p, 0.36, 0.42), 1 - segment(p, 0.72, 0.78)) : 0

  // Plane path: lift off the desk, climb, level at cruise, glide down to land.
  const scale = 1 - 0.45 * takeoff - 0.12 * clouds - 0.08 * cruise - 0.1 * lift
  const x = 6 * takeoff - 4 * cruise
  const y = -10 * takeoff + 2.5 * Math.sin(clouds * Math.PI * 2) - 2 * cruise + 46 * land - 22 * lift
  const tilt = -14 * takeoff * (1 - cruise) + 10 * land

  const pieces: Record<string, PieceStyle> = {}

  const sky = skyBlend(p)
  SKY_STOPS.forEach((_, i) => {
    pieces[`sky-${i}`] = { opacity: i === sky.lower ? 1 : i === sky.upper ? sky.t : 0 }
  })

  pieces["desk-bg"] = { opacity: clamp01(1 - takeoff * 1.4), transform: t3(0, takeoff * 60) }
  pieces.desk = { opacity: clamp01(1 - takeoff * 2.5) }
  for (const item of DESK_ITEMS) pieces[item.key] = { transform: deskTransform(item, fold, takeoff) }

  pieces.sun = { opacity: windowOpacity(p, [0.26, 0.54]), transform: t3(0, 30 - 24 * segment(p, 0.26, 0.5)) }
  pieces.skyline = {
    transform: t3(0, (1 - segment(p, 0.29, 0.36)) * 100 + segment(p, 0.38, 0.52) * 110, "vw", "%"),
  }
  pieces.birds = { opacity: windowOpacity(p, [0.36, 0.58]), transform: t3(-20 * segment(p, 0.36, 0.58), 0) }
  pieces.wordmark = { opacity: windowOpacity(p, [0.27, 0.42]) }

  pieces.clouds = { opacity: 1 - dark * 0.85 }
  CLOUDS.forEach((cloud, i) => {
    pieces[`cloud-${i}`] = { transform: t3(0, clouds * cloud.speed * 520) }
  })
  FEATURE_WINDOWS.forEach((window, i) => {
    const o = windowOpacity(p, window)
    pieces[`feature-${i}`] = { opacity: o, transform: `${t3(0, (1 - o) * 6)} rotate(${i % 2 ? 1.5 : -1.5}deg)` }
  })

  pieces.night = { opacity: dark }
  pieces.shoot = {
    opacity: windowOpacity(p, [0.75, 0.81]),
    transform: t3(segment(p, 0.75, 0.81) * 14, segment(p, 0.75, 0.81) * 6),
  }
  pieces.earth = { opacity: clamp01(cruise * (1 - land * 2)), transform: t3(0, (1 - cruise) * 30 + land * 40) }
  pieces["night-clouds"] = { opacity: night * 0.95, transform: t3(-10 * drift, 0) }
  pieces["dplane-0"] = { opacity: night, transform: `${t3(10 * drift, -3 * drift)} rotate(-6deg)` }
  pieces["dplane-1"] = { opacity: night * 0.7, transform: `${t3(6 * drift, 0)} rotate(-3deg)` }
  pieces.contrail = { opacity: clamp01(dark * (1 - land * 3)) }
  for (const key of ["night-copy", "tag", "tally", "altitude"]) pieces[key] = { opacity: night }
  pieces.home = { transform: t3(0, (1 - segment(p, 0.9, 0.99)) * 100, "vw", "%") }

  pieces.plane = {
    opacity: 1 - segment(p, 0.96, 1),
    transform: `translate3d(calc(-50% + ${x.toFixed(2)}vw), calc(-50% + ${y.toFixed(2)}vh), 0) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
  }
  pieces["card-stack"] = { opacity: clamp01(1 - fold * 5) }
  pieces["hero-head"] = { opacity: hero, transform: t3(0, (1 - hero) * -4) }
  pieces["hero-cta"] = { opacity: hero }
  pieces.hint = { opacity: 1 - segment(p, ...SCENES.hint) }

  return { fold, contrail: 1 - segment(p, 0.72, 0.86), pieces }
}
