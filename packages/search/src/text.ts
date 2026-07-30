/**
 * Tokenization + trigram helpers (deterministic stand-in for Postgres FTS / pg_trgm).
 * When Neon is provisioned, swap scoreText/scoreTrigram for SQL ts_rank / similarity().
 */

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "be",
  "how",
  "what",
  "why",
  "when",
  "with",
  "you",
  "me",
  "i",
  "it",
  "this",
  "that",
  "from",
  "as",
  "at",
  "by",
]);

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s$%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Character trigrams for typo-tolerant / substring similarity. */
export function trigrams(input: string): Set<string> {
  const s = `  ${normalizeText(input).replace(/\s+/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    out.add(s.slice(i, i + 3));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Sparse bag-of-tokens vector (unit L2) — placeholder until AI SDK embed() + pgvector. */
export function lexicalVector(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  let norm = 0;
  for (const c of counts.values()) norm += c * c;
  norm = Math.sqrt(norm) || 1;
  const vec = new Map<string, number>();
  for (const [t, c] of counts) vec.set(t, c / norm);
  return vec;
}

export function cosineSparse(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [t, v] of smaller) {
    const w = larger.get(t);
    if (w !== undefined) dot += v * w;
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Lightweight TF coverage score: fraction of query tokens present in doc,
 * with a mild IDF-less boost for repeated matches.
 */
export function scoreTextOverlap(queryTokens: string[], docTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const docSet = new Set(docTokens);
  const docCounts = new Map<string, number>();
  for (const t of docTokens) docCounts.set(t, (docCounts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of queryTokens) {
    if (docSet.has(t)) hit += 1 + Math.min(1, (docCounts.get(t) ?? 0) / 4);
  }
  return Math.min(1, hit / (queryTokens.length * 1.5));
}

export function slugifyFirm(name: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown";
  return `firm_${slug}`;
}
