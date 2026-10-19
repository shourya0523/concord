/**
 * Spoken-answer delivery score (plan 2026-09-23-001 P7.1). Pure and
 * client-safe: computed from the recording duration and the transcript.
 * Delivery is coaching only — it never affects content mastery.
 *
 * score = 0.4·duration fit (60–90 s target) + 0.35·pace (130–170 wpm)
 *       + 0.25·filler control (um / uh / like / you know / basically)
 */
import type { DeliveryScore } from "@ibpe/contracts"

export const TARGET_MIN_MS = 60_000
export const TARGET_MAX_MS = 90_000
export const IDEAL_WPM: readonly [number, number] = [130, 170]

const DURATION_FLOOR_MS = 15_000
const DURATION_CEIL_MS = 180_000
const WPM_FLOOR = 80
const WPM_CEIL = 230
/** Fillers per 100 words at which the filler sub-score reaches 0. */
const FILLER_RATE_CEIL = 8

const WEIGHTS = { duration: 0.4, pace: 0.35, filler: 0.25 } as const

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function countWords(transcript: string): number {
  const words = transcript.toLowerCase().match(/[a-z0-9$%][a-z0-9'’$%.,-]*/gi)
  return words ? words.length : 0
}

/** "like" used as a verb or comparison is not a filler. */
const LIKE_NOT_FILLER = /(?:would|'d|’d|looks?|feels?|seems?|something|anything|nothing|just|more|less|much|things?|companies|firms)\s+$/i

/** Count filler words: um/umm, uh/uhh, er/erm, filler "like", "you know", "basically". */
export function countFillers(transcript: string): number {
  const text = ` ${transcript.toLowerCase().replace(/\s+/g, " ")} `
  let count = 0
  count += (text.match(/\b(?:u+m+|u+h+|e+r+m*|h+m+)\b/g) ?? []).length
  count += (text.match(/\byou know\b/g) ?? []).length
  count += (text.match(/\bbasically\b/g) ?? []).length
  const likeRe = /\blike\b/g
  let match: RegExpExecArray | null
  while ((match = likeRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 24), match.index)
    if (!LIKE_NOT_FILLER.test(before)) count += 1
  }
  return count
}

export function durationFit(durationMs: number): number {
  if (durationMs >= TARGET_MIN_MS && durationMs <= TARGET_MAX_MS) return 1
  if (durationMs < TARGET_MIN_MS) {
    return clamp01((durationMs - DURATION_FLOOR_MS) / (TARGET_MIN_MS - DURATION_FLOOR_MS))
  }
  return clamp01((DURATION_CEIL_MS - durationMs) / (DURATION_CEIL_MS - TARGET_MAX_MS))
}

export function paceFit(wordsPerMinute: number): number {
  const [low, high] = IDEAL_WPM
  if (wordsPerMinute >= low && wordsPerMinute <= high) return 1
  if (wordsPerMinute < low) return clamp01((wordsPerMinute - WPM_FLOOR) / (low - WPM_FLOOR))
  return clamp01((WPM_CEIL - wordsPerMinute) / (WPM_CEIL - high))
}

export function fillerFit(fillerCount: number, wordCount: number): number {
  if (wordCount <= 0) return 0
  const per100 = (fillerCount / wordCount) * 100
  return clamp01(1 - per100 / FILLER_RATE_CEIL)
}

export function computeDelivery(input: { durationMs: number; transcript: string }): DeliveryScore {
  const durationMs = Math.max(0, Math.round(input.durationMs))
  const transcript = input.transcript.trim()
  const wordCount = countWords(transcript)
  const fillerCount = countFillers(transcript)
  const minutes = durationMs / 60_000
  const wordsPerMinute = minutes > 0 ? wordCount / minutes : 0

  if (wordCount === 0 || durationMs === 0) {
    return {
      duration_ms: durationMs,
      word_count: wordCount,
      words_per_minute: 0,
      filler_count: fillerCount,
      score: 0,
      note: "No speech detected — try recording again closer to the mic.",
    }
  }

  const parts = {
    duration: durationFit(durationMs),
    pace: paceFit(wordsPerMinute),
    filler: fillerFit(fillerCount, wordCount),
  }
  const score =
    WEIGHTS.duration * parts.duration + WEIGHTS.pace * parts.pace + WEIGHTS.filler * parts.filler

  return {
    duration_ms: durationMs,
    word_count: wordCount,
    words_per_minute: round(wordsPerMinute, 0),
    filler_count: fillerCount,
    score: round(clamp01(score)),
    note: deliveryNote({ durationMs, wordsPerMinute, parts }),
  }
}

function deliveryNote(options: {
  durationMs: number
  wordsPerMinute: number
  parts: { duration: number; pace: number; filler: number }
}): string {
  const { parts } = options
  const weakest = (Object.entries(parts) as Array<[keyof typeof parts, number]>).sort(
    (a, b) => a[1] - b[1],
  )[0]!
  if (weakest[1] >= 0.9) return "Clean delivery — on time, steady pace, few fillers."
  if (weakest[0] === "duration") {
    return options.durationMs < TARGET_MIN_MS
      ? "Short answer — aim for 60–90 seconds so you cover the structure."
      : "Long answer — land it in 60–90 seconds, then let them follow up."
  }
  if (weakest[0] === "pace") {
    return options.wordsPerMinute < IDEAL_WPM[0]
      ? "Slow pace — tighten pauses; aim for ~130–170 words a minute."
      : "Fast pace — slow down to ~130–170 words a minute."
  }
  return "Filler words (um, uh, like, you know, basically) — pause silently instead."
}
