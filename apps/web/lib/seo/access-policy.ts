/**
 * What signed-out visitors see on the public guide, in one place.
 *
 * Public pages carry enough to rank and to be useful (summaries, diagrams,
 * lesson openings, a few full interview answers, the top firm topics). The
 * rest shows a lock that sends people into the app. Locked content is never
 * rendered into the HTML, so it can't be scraped from the page source.
 *
 * When the paid tier ships, point `unlockHref` at the upgrade flow and, if
 * needed, narrow what the free account sees in the app itself.
 */
import { signUpFor } from "@/lib/seo/public-content"

/**
 * Concepts whose full "how to answer in an interview" scripts are public, as
 * samples. DCF is the most-searched technical question. LBO, M&A and PE stay
 * locked.
 */
export const OPEN_ANSWER_CONCEPT_SLUGS: ReadonlySet<string> = new Set(["dcf-wacc", "valuation-comps"])

/** Firm pages list this many topics publicly; the rest are locked. */
export const PUBLIC_FIRM_TOPIC_COUNT = 3

export function isAnswerPublic(conceptSlug: string): boolean {
  return OPEN_ANSWER_CONCEPT_SLUGS.has(conceptSlug)
}

/** Where a lock sends people. Today: free sign-up, returning to the in-app page. */
export function unlockHref(appPath: string): string {
  return signUpFor(appPath)
}

/** Split a ranked list into what is shown and how many are locked. */
export function splitPublic<T>(items: T[], visible: number): { shown: T[]; locked: number } {
  return { shown: items.slice(0, visible), locked: Math.max(0, items.length - visible) }
}
