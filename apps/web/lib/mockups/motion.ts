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

/**
 * Resolve `var(--token)` against an element's computed style so rough.js /
 * rough-notation get a concrete colour for SVG `stroke` / `fill` attributes.
 * Non-var colours pass through untouched.
 */
export function resolveCssColor(el: Element, color: string): string {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(color.trim())
  if (!match || typeof window === "undefined") return color
  const value = getComputedStyle(el).getPropertyValue(match[1]!).trim()
  return value || match[2]?.trim() || "currentColor"
}
