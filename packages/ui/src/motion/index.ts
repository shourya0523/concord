import type { Transition, Variants } from "motion/react"

import { motion as tokens } from "@ibpe/ui/lib/tokens"

/** Motion for React cubic-bezier control points (Editorial Finance Terminal). */
export const terminalEase = [0.22, 1, 0.36, 1] as const

export const transitions = {
  micro: {
    duration: tokens.micro,
    ease: terminalEase,
  } satisfies Transition,
  control: {
    duration: tokens.control,
    ease: terminalEase,
  } satisfies Transition,
  panel: {
    duration: tokens.panel,
    ease: terminalEase,
  } satisfies Transition,
  page: {
    duration: tokens.page,
    ease: terminalEase,
  } satisfies Transition,
  milestone: {
    duration: tokens.milestone,
    ease: terminalEase,
  } satisfies Transition,
} as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.panel,
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.control,
  },
}

export const revealStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
}

export const scaleTap = {
  whileTap: { scale: 0.98 },
  transition: transitions.micro,
} as const

/** Prefer CSS / View Transitions when reduced-motion is on. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
