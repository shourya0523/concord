/**
 * Editorial Finance Terminal — design tokens (JS mirror of CSS variables).
 * Prefer CSS vars / Tailwind theme classes in components; use this for charts & JS motion.
 */

export const fonts = {
  display: '"Instrument Serif", "Instrument Serif Fallback", ui-serif, Georgia, serif',
  sans: '"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif',
  mono: '"Geist Mono", "Geist Mono Fallback", ui-monospace, monospace',
} as const

export const radii = {
  control: "0.625rem",
  panel: "0.875rem",
  study: "1.5rem",
  editorial: "0.25rem",
  pill: "9999px",
} as const

export const motion = {
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  micro: 0.14,
  control: 0.2,
  panel: 0.28,
  page: 0.4,
  milestone: 0.7,
} as const

export const heatLevels = [0, 1, 2, 3, 4] as const
export type HeatLevel = (typeof heatLevels)[number]

export const heatClassName: Record<HeatLevel, string> = {
  0: "bg-heat-0",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
}

export const brand = {
  name: "Editorial Finance Terminal",
  accent: "acid-lime",
  surfaces: "warm-paper",
} as const
