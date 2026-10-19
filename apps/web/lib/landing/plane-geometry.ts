/**
 * Paper Concorde fold (DESIGN.md §17 landing). The index card and the plane
 * share one set of seven vertices, so folding is a straight interpolation of
 * each vertex from its card position to its plane position. Pure — tested.
 *
 * Card space is 400 × 250. The plane points right (nose at x = 400).
 */
export type Point = readonly [number, number]

export const CARD_W = 400
export const CARD_H = 250

/** Vertex → [card position, plane position]. */
export const VERTICES = {
  wingTipTop: [[0, 0], [70, 22]],
  wingRootTop: [[400, 0], [250, 113]],
  nose: [[400, 125], [400, 125]],
  wingRootBottom: [[400, 250], [250, 137]],
  wingTipBottom: [[0, 250], [70, 228]],
  tail: [[0, 125], [42, 125]],
  keel: [[200, 125], [205, 125]],
} as const satisfies Record<string, readonly [Point, Point]>

export type VertexName = keyof typeof VERTICES

/**
 * Six triangles tile the card exactly and fold into the plane: two nose
 * facets, two wing facets, two rear wing facets.
 */
export const FACETS: ReadonlyArray<{ id: string; vertices: readonly [VertexName, VertexName, VertexName]; shade: string }> = [
  { id: "nose-top", vertices: ["wingRootTop", "nose", "keel"], shade: "#e8e1d1" },
  { id: "wing-top", vertices: ["wingTipTop", "wingRootTop", "keel"], shade: "#fbf8f0" },
  { id: "rear-top", vertices: ["wingTipTop", "keel", "tail"], shade: "#efe8da" },
  { id: "nose-bottom", vertices: ["wingRootBottom", "nose", "keel"], shade: "#ddd5c3" },
  { id: "wing-bottom", vertices: ["wingTipBottom", "wingRootBottom", "keel"], shade: "#f4efe3" },
  { id: "rear-bottom", vertices: ["wingTipBottom", "keel", "tail"], shade: "#e6dfcf" },
]

export const CARD_FILL = "#fdfbf6"

/** Ease in-out so the fold starts and lands softly. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function vertexAt(name: VertexName, fold: number): Point {
  const [[cx, cy], [px, py]] = VERTICES[name]
  const t = easeInOut(fold)
  return [cx + (px - cx) * t, cy + (py - cy) * t]
}

export function facetPoints(vertices: readonly VertexName[], fold: number): string {
  return vertices
    .map((name) => vertexAt(name, fold))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")
}

/** Linear mix of two #rrggbb colours. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * k).toString(16).padStart(2, "0")).join("")}`
}

/** Progress of `p` through [start, end], clamped to 0–1. */
export function segment(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

/** Sky colour stops along the whole scroll (0 = desk, 1 = landing). */
export const SKY_STOPS: ReadonlyArray<{ at: number; top: string; bottom: string }> = [
  { at: 0, top: "#f7f1e4", bottom: "#f7f1e4" },
  { at: 0.26, top: "#f7f1e4", bottom: "#f7f1e4" },
  { at: 0.36, top: "#f3d9c4", bottom: "#f8ecdf" },
  { at: 0.5, top: "#a9c9e2", bottom: "#e4eef3" },
  { at: 0.66, top: "#4f6f96", bottom: "#a4c0d8" },
  { at: 0.78, top: "#0f1730", bottom: "#2b4268" },
  { at: 0.88, top: "#0f1730", bottom: "#2b4268" },
  { at: 0.93, top: "#33416e", bottom: "#e3a487" },
  { at: 0.97, top: "#ecc9b2", bottom: "#f7e4d2" },
  { at: 1, top: "#f7f1e4", bottom: "#f7f1e4" },
]

export function skyAt(p: number): { top: string; bottom: string } {
  const stops = SKY_STOPS
  if (p <= stops[0]!.at) return { top: stops[0]!.top, bottom: stops[0]!.bottom }
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]!
    const b = stops[i]!
    if (p <= b.at) {
      const t = segment(p, a.at, b.at)
      return { top: mixHex(a.top, b.top, t), bottom: mixHex(a.bottom, b.bottom, t) }
    }
  }
  const last = stops[stops.length - 1]!
  return { top: last.top, bottom: last.bottom }
}

/**
 * The sky as a crossfade between fixed gradient layers (one per stop), so the
 * page animates opacity instead of repainting a gradient every frame: the
 * `lower` layer is fully on and the `upper` layer sits on it at opacity `t`.
 */
export function skyBlend(p: number): { lower: number; upper: number; t: number } {
  const stops = SKY_STOPS
  if (p <= stops[0]!.at) return { lower: 0, upper: 0, t: 0 }
  for (let i = 1; i < stops.length; i += 1) {
    if (p <= stops[i]!.at) return { lower: i - 1, upper: i, t: segment(p, stops[i - 1]!.at, stops[i]!.at) }
  }
  const last = stops.length - 1
  return { lower: last, upper: last, t: 0 }
}
