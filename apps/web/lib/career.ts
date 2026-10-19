/**
 * Career ladder (DESIGN.md §16 "Working Papers"): XP levels shown as banking
 * titles on a business card. Pure — the level maths stays in `data/xp.ts`;
 * this only names the levels. PE-track users climb the buy-side ladder.
 */
import { levelForXp } from "@/lib/data/xp"

export type CareerTrack = "IB" | "PE"

const IB_LADDER = [
  "Intern",
  "Analyst I",
  "Analyst II",
  "Analyst III",
  "Associate I",
  "Associate II",
  "Associate III",
  "Vice President",
  "Director",
  "Managing Director",
] as const

const PE_LADDER = [
  "Intern",
  "Analyst I",
  "Analyst II",
  "Associate I",
  "Associate II",
  "Senior Associate",
  "Vice President",
  "Principal",
  "Director",
  "Partner",
] as const

/** Profile track → ladder. "Both" and unset use the banking ladder. */
export function careerTrack(track: string | null | undefined): CareerTrack {
  return track === "PE" ? "PE" : "IB"
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th"
  return `${n}${n % 10 > 3 ? "th" : suffix}`
}

/** Title for a 1-based level. Past the ladder: "Managing Director, 2nd year". */
export function titleForLevel(level: number, track: CareerTrack = "IB"): string {
  const ladder = track === "PE" ? PE_LADDER : IB_LADDER
  const safe = Math.max(1, Math.floor(level))
  if (safe <= ladder.length) return ladder[safe - 1] as string
  const top = ladder[ladder.length - 1] as string
  return `${top}, ${ordinal(safe - ladder.length + 1)} year`
}

export type CareerCard = {
  level: number
  title: string
  next_title: string
  track: CareerTrack
  xp: number
  floor: number
  next: number
  progress: number
}

export function careerCard(xp: number, track: CareerTrack = "IB"): CareerCard {
  const info = levelForXp(xp)
  return {
    level: info.level,
    title: titleForLevel(info.level, track),
    next_title: titleForLevel(info.level + 1, track),
    track,
    xp: Math.max(0, Math.floor(xp)),
    floor: info.floor,
    next: info.next,
    progress: info.progress,
  }
}

/** Level change across an XP gain; null when the level held. */
export function levelChange(before: number, after: number): { from: number; to: number } | null {
  const from = levelForXp(before).level
  const to = levelForXp(after).level
  return to > from ? { from, to } : null
}
