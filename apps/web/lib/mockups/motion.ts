/** DESIGN.md motion helpers for Phase 1 mockups. */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export const EASE = {
  settle: "var(--ease-settle)",
  bounce: "var(--ease-bounce)",
  calm: "var(--ease-calm)",
} as const

/** Deterministic seed from a string (rough.js stability). */
export function seedFrom(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  }
  return Math.abs(h) || 1
}
