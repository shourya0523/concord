/**
 * Pure domain helpers (no I/O). Keep side-effect free.
 * Types mirrored from @ibpe/contracts enums (avoid TS project rootDir coupling).
 */

export type Domain = "ib" | "pe" | "both" | "other";
export type BankTrack = "IB" | "PE" | "Banking" | "VC";

/** Map Glassdoor bank track → corpus Domain. */
export function trackToDomain(track: string): Domain {
  const t = track.trim().toUpperCase();
  if (t === "IB") return "ib";
  if (t === "PE") return "pe";
  if (t === "BANKING" || t === "VC") return "both";
  return "other";
}

/** Map corpus Domain → preferred bank track label. */
export function domainToTrack(domain: Domain): BankTrack | "Other" {
  if (domain === "ib") return "IB";
  if (domain === "pe") return "PE";
  if (domain === "both") return "Banking";
  return "Other";
}

/** Stable bank question id key parts (must match scrapers/bank.py). */
export function bankQuestionKey(
  company: string,
  position: string,
  question: string,
): string {
  return `${company}|${position}|${question}`;
}
