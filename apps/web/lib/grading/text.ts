/**
 * Text normalisation shared by the grader (pure, client-safe).
 *
 * Two different normalisations are used on purpose:
 *   - `normaliseForMatch` keeps word order + punctuation-light text so code can
 *     verify that an LLM "evidence" quote really appears in the answer.
 *   - `contentTokens` / `stem` produce a bag of content words for overlap,
 *     cue matching and Jaccard (anti-gaming).
 */

export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "are",
  "be", "as", "with", "that", "this", "it", "you", "your", "from", "by", "at",
  "we", "i", "its", "was", "were", "been", "being", "has", "have", "had", "do",
  "does", "did", "but", "if", "then", "than", "so", "such", "into", "their",
  "they", "them", "there", "these", "those", "which", "who", "what", "when",
  "where", "why", "how", "will", "would", "can", "could", "should", "may",
  "might", "also", "not", "no", "yes", "all", "any", "each", "some", "more",
  "most", "very", "just", "about", "over", "under", "because", "while", "per",
  "via", "our", "us", "my", "me", "he", "she", "his", "her", "one", "use",
  "used", "using", "get", "gets", "like", "e.g", "i.e", "etc",
])

const UNICODE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2010-\u2015\u2212]/g, "-"],
  [/\u00A0/g, " "],
  [/\u2026/g, "..."],
  [/\u00D7/g, "x"],
]

/** Unicode-normalise quotes / dashes / ellipsis / NBSP, lower-case, collapse whitespace. */
export function normaliseForMatch(text: string): string {
  let out = text.normalize("NFKC")
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out.toLowerCase().replace(/\s+/g, " ").trim()
}

/** normaliseForMatch + punctuation stripped (models often drop commas/quotes). */
export function normaliseLoose(text: string): string {
  return normaliseForMatch(text)
    .replace(/[^a-z0-9%$.\s]/g, " ")
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Very small suffix stripper — enough to match "flows"/"flow", "levered"/"lever". */
export function stem(token: string): string {
  if (token.length <= 4 || /\d/.test(token)) return token
  const rules: Array<[RegExp, string]> = [
    [/ies$/, "y"],
    [/(ss)es$/, "$1"],
    [/(sh|ch|x|z)es$/, "$1"],
    [/ing$/, ""],
    [/ed$/, ""],
    [/ly$/, ""],
    [/([^s])s$/, "$1"],
  ]
  let base = token
  for (const [pattern, replacement] of rules) {
    if (pattern.test(token)) {
      const next = token.replace(pattern, replacement)
      if (next.length >= 3) base = next
      break
    }
  }
  // "consolidate" / "consolidated" / "consolidates" → "consolidat".
  if (base.length > 4 && base.endsWith("e")) base = base.slice(0, -1)
  return base
}

/** All word tokens (lower-case, punctuation removed, stop words kept). */
export function wordTokens(text: string): string[] {
  return normaliseForMatch(text)
    .replace(/[^a-z0-9%&\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

/** Content tokens: stop words and 1–2 char noise removed, stemmed. */
export function contentTokens(text: string): string[] {
  return wordTokens(text)
    .filter((t) => (t.length > 2 || /\d/.test(t) || t === "ev" || t === "pe") && !STOP_WORDS.has(t))
    .map(stem)
}

export function tokenSet(text: string): Set<string> {
  return new Set(contentTokens(text))
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** Share of word tokens that are stop words — prose ≈ 0.3–0.5, keyword lists ≈ 0. */
export function proseRatio(text: string): number {
  const words = wordTokens(text)
  if (words.length === 0) return 0
  const stop = words.filter((w) => STOP_WORDS.has(w)).length
  return stop / words.length
}

export function wordCount(text: string): number {
  return wordTokens(text).length
}

/** Split into rough sentences for evidence extraction. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
