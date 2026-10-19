/**
 * Seeded deterministic RNG for drills: FNV-1a 32-bit hash of the seed string
 * feeds mulberry32. Same seed ⇒ same sequence on every JS runtime.
 */

export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function mulberry32(a: number): () => number {
  let state = a >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** Multiple of `step` in [min, max] inclusive (both ends multiples of step). */
  step(min: number, max: number, step: number): number
  pick<T>(items: readonly T[]): T
}

/** Round to a fixed number of decimals without binary-float noise (0.1 + 0.2 ⇒ 0.3). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f
}

function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf(".")
  return dot === -1 ? 0 : text.length - dot - 1
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashSeed(seed))
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    step(min, max, step) {
      const n = Math.round((max - min) / step)
      return roundTo(min + int(0, n) * step, decimalsOf(step))
    },
    pick(items) {
      if (items.length === 0) throw new Error("pick from empty list")
      return items[int(0, items.length - 1)] as (typeof items)[number]
    },
  }
}
