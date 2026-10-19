/**
 * Pricing tiers (DESIGN.md §17.4, docs/product/pricing-unit-economics.md).
 * Pure — no Next.js or auth imports — so the pricing page, sign-up, settings
 * and tests share one source of truth.
 *
 * Names follow the landing's Paper Concorde theme: Standby (free, fly when
 * there's a seat), Supersonic (the $10 individual subscription), Charter
 * (a team books the plane), Fleet (custom, for programs).
 *
 * Metering (lib/billing/meter.ts) enforces the limits. Checkout is not wired
 * yet: accounts start on Standby, and Supersonic, Charter and Fleet are
 * requested by email and granted by an admin (POST /api/admin/billing).
 * Bring-your-own-key is a Charter / Fleet perk the admin sets up; individuals
 * can't add a key.
 */

export const CONTACT_EMAIL = "sohumbalsara@gmail.com"

/** Same ids as the stored account plan (billing_accounts.plan). */
export type PlanId = "free" | "credits" | "team" | "custom"

/** What each AI action costs in credits. Practice itself is never metered. */
export const CREDIT_COST = { grade: 1, coaching: 2, voice: 3 } as const

/** Free per-day caps on AI actions, reset at 00:00 UTC. */
export const FREE_DAILY_LIMITS = { grade: 10, coaching: 1, voice: 3 } as const

/** Supersonic: price and monthly credits. */
export const CREDITS_PRICE_USD = 10
export const CREDITS_PER_MONTH = 1_500

/** Charter: price and monthly credits per seat, with a seat minimum. */
export const SEAT_PRICE_USD = 5
export const SEAT_CREDITS_PER_MONTH = 1_000
export const TEAM_MIN_SEATS = 3

/** Plans that can run on the organisation's own OpenRouter key. */
export const ORG_KEY_PLANS: readonly PlanId[] = ["team", "custom"]

export type Plan = {
  id: PlanId
  /** Thematic name shown to people. */
  name: string
  /** Plain description of who it's for ("Individual", "Team"). */
  kind: string
  /** Headline price, e.g. "Free". */
  price: string
  /** Small print under the price. */
  cadence: string
  blurb: string
  features: readonly string[]
  cta: string
  /** Shown as the recommended card. */
  featured?: boolean
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Standby",
    kind: "Individual",
    price: "Free",
    cadence: "Daily AI limits",
    blurb: "Get on board for free. AI help when there's a seat today.",
    features: [
      "The full question bank, firm heat, daily sets, drills and leagues",
      `Every day: ${FREE_DAILY_LIMITS.grade} graded answers, ${FREE_DAILY_LIMITS.coaching} coaching report, ${FREE_DAILY_LIMITS.voice} voice answers`,
      "Limits reset at midnight UTC",
    ],
    cta: "Start free",
  },
  {
    id: "credits",
    name: "Supersonic",
    kind: "Individual",
    price: `$${CREDITS_PRICE_USD}`,
    cadence: `A month · ${CREDITS_PER_MONTH.toLocaleString("en-US")} credits`,
    blurb: "For the weeks before your superday, when you need more than a daily seat.",
    features: [
      "Everything in Standby",
      `${CREDITS_PER_MONTH.toLocaleString("en-US")} credits a month on top of the free daily uses`,
      `Grading ${CREDIT_COST.grade} credit, coaching ${CREDIT_COST.coaching}, voice ${CREDIT_COST.voice}`,
      "Credits refill on the 1st",
    ],
    cta: "Go Supersonic",
    featured: true,
  },
  {
    id: "team",
    name: "Charter",
    kind: "Team",
    price: `$${SEAT_PRICE_USD}`,
    cadence: `Per seat a month · ${TEAM_MIN_SEATS} seat minimum`,
    blurb: "For clubs, cohorts and recruiting groups flying together.",
    features: [
      "Everything in Supersonic",
      `${SEAT_CREDITS_PER_MONTH.toLocaleString("en-US")} credits per seat a month`,
      "Or bring your own OpenRouter key: every seat runs on it, no caps",
      "One invoice for the group",
    ],
    cta: "Book a charter",
  },
  {
    id: "custom",
    name: "Fleet",
    kind: "Custom",
    price: "Let's talk",
    cadence: "Tailored to you",
    blurb: "For schools, banks and programs running many groups.",
    features: [
      "Custom credit limits and seats",
      "Bring your own OpenRouter key",
      "Your own firms, questions and tracks",
      "Onboarding help for your group",
    ],
    cta: "Contact us",
  },
] as const

export const DEFAULT_PLAN_ID: PlanId = "free"

export function getPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id)!
}

/** Account ID goes in the body so an admin can grant the plan (POST /api/admin/billing). */
function mailto(subject: string, accountId?: string | null): string {
  const body = accountId ? `&body=${encodeURIComponent(`Account ID: ${accountId}\n\n`)}` : ""
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body}`
}

/** mailto link requesting a plan until checkout is wired. */
export function contactHref(plan: PlanId, accountId?: string | null): string {
  const { name, kind } = getPlan(plan)
  return mailto(`Concord ${name} (${kind}) plan`, accountId)
}

/**
 * Where a plan's button goes. Standby starts at sign-up; Supersonic goes to
 * Settings → Plan (after sign-up), where the request email carries the
 * account ID; Charter and Fleet open an email.
 */
export function planCtaHref(plan: PlanId, signedIn: boolean): string {
  if (plan === "team" || plan === "custom") return contactHref(plan)
  if (plan === "credits") return signedIn ? "/settings" : "/sign-up?next=%2Fsettings"
  return signedIn ? "/settings" : "/sign-up"
}
