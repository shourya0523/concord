/**
 * Pricing tiers (DESIGN.md §17.4, docs/product/pricing-unit-economics.md).
 * Pure — no Next.js or auth imports — so the pricing page, sign-up, settings
 * and tests share one source of truth.
 *
 * Billing is not wired yet: every Neon Auth account is on Individual (free
 * daily limits), and credits, Team and Custom go through a contact email
 * until checkout exists.
 */

export const CONTACT_EMAIL = "sohumbalsara@gmail.com"

export type PlanId = "individual" | "team" | "custom"

/** What each AI action costs in credits. Practice itself is never metered. */
export const CREDIT_COST = { grade: 1, coaching: 2, voice: 3 } as const

/** Free accounts: per-day caps on AI actions, reset at local midnight. */
export const FREE_DAILY_LIMITS = { grade: 10, coaching: 1, voice: 3 } as const

/** Individual credit pack: price and monthly credits. */
export const CREDITS_PRICE_USD = 10
export const CREDITS_PER_MONTH = 1_500

/** Team: price and pooled credits per seat, with a seat minimum. */
export const SEAT_PRICE_USD = 5
export const SEAT_CREDITS_PER_MONTH = 1_000
export const TEAM_MIN_SEATS = 3

export type Plan = {
  id: PlanId
  name: string
  /** Headline price, e.g. "Free". */
  price: string
  /** Small print under the price. */
  cadence: string
  /** Optional paid step within the plan. */
  upgrade?: string
  blurb: string
  features: readonly string[]
  cta: string
  /** Shown as the recommended card. */
  featured?: boolean
}

export const PLANS: readonly Plan[] = [
  {
    id: "individual",
    name: "Individual",
    price: "Free",
    cadence: "Daily AI limits",
    upgrade: `or $${CREDITS_PRICE_USD}/month for ${CREDITS_PER_MONTH.toLocaleString("en-US")} credits`,
    blurb: "For one candidate prepping for IB or PE interviews.",
    features: [
      "The full question bank, firm heat, daily sets, drills and leagues",
      `Free every day: ${FREE_DAILY_LIMITS.grade} graded answers, ${FREE_DAILY_LIMITS.coaching} coaching report, ${FREE_DAILY_LIMITS.voice} voice answers`,
      `Credits lift the daily caps: grading ${CREDIT_COST.grade}, coaching ${CREDIT_COST.coaching}, voice ${CREDIT_COST.voice}`,
    ],
    cta: "Start free",
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    price: `$${SEAT_PRICE_USD}`,
    cadence: `Per seat a month · ${TEAM_MIN_SEATS} seat minimum`,
    blurb: "For clubs, cohorts and recruiting groups prepping together.",
    features: [
      "Everything in Individual",
      `${SEAT_CREDITS_PER_MONTH.toLocaleString("en-US")} credits per seat a month, pooled across the team`,
      "Shared target firms and progress for the group",
      "One invoice for the team",
    ],
    cta: "Get team access",
  },
  {
    id: "custom",
    name: "Custom",
    price: "Let's talk",
    cadence: "Tailored to you",
    blurb: "For schools, banks and programs with their own needs.",
    features: [
      "Custom credit limits and seats",
      "Your own firms, questions and tracks",
      "Onboarding help for your group",
    ],
    cta: "Contact us",
  },
] as const

export const DEFAULT_PLAN_ID: PlanId = "individual"

export function getPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id)!
}

function mailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}

/** mailto link for plans sold by conversation (Team, Custom). */
export function contactHref(plan: PlanId): string {
  return mailto(`Concord ${getPlan(plan).name} plan`)
}

/** mailto link for the $10 credit pack until checkout is wired. */
export function creditsHref(): string {
  return mailto(`Concord credits ($${CREDITS_PRICE_USD}/month)`)
}

/**
 * Where a plan's button goes. Individual starts at sign-up (or settings when
 * already signed in); Team and Custom open an email until checkout is wired.
 */
export function planCtaHref(plan: PlanId, signedIn: boolean): string {
  if (plan !== "individual") return contactHref(plan)
  return signedIn ? "/settings" : "/sign-up"
}

/** The plan an account is on. Everyone is on Individual until billing ships. */
export function currentPlanId(): PlanId {
  return DEFAULT_PLAN_ID
}
