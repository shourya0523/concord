#!/usr/bin/env npx tsx
/**
 * Link Glassdoor occurrences → teaching canonical questions (firm signals only).
 *
 * Never copies Glassdoor prose into answers. Updates
 * canonical.question_occurrences.canonical_question_id where NULL.
 *
 * Match order: exact normalised hash → fuzzy token-set ratio (default 88),
 * preferring same-topic pairs.
 *
 * Usage:
 *   DATABASE_URL=… npm run link:occurrences -w @ibpe/database
 *   DATABASE_URL=… npm run link:occurrences -w @ibpe/database -- --dry-run
 *   DATABASE_URL=… npm run link:occurrences -w @ibpe/database -- --threshold 90 --limit 500
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
config({ path: path.join(repoRoot, ".env.local") });
config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(repoRoot, "apps/web/.env.local") });

const DEFAULT_THRESHOLD = 85;

function parseArgs(argv: string[]) {
  let dryRun = false;
  let threshold = DEFAULT_THRESHOLD;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--threshold") threshold = Number(argv[++i]);
    else if (a === "--limit") limit = Number(argv[++i]);
  }
  return { dryRun, threshold, limit };
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisedHash(text: string): string {
  return createHash("sha256").update(normalise(text)).digest("hex");
}

function tokens(text: string): Set<string> {
  return new Set(normalise(text).split(" ").filter((t) => t.length > 1));
}

/** Approximate rapidfuzz token_set_ratio on a 0–100 scale. */
function tokenSetRatio(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const sortedA = [...ta].sort();
  const sortedB = [...tb].sort();
  const onlyA = sortedA.filter((t) => !tb.has(t));
  const onlyB = sortedB.filter((t) => !ta.has(t));
  const intersection = sortedA.filter((t) => tb.has(t));
  const combo1 = [...intersection, ...onlyA].join(" ");
  const combo2 = [...intersection, ...onlyB].join(" ");
  const base = inter / Math.max(ta.size, tb.size);
  const partial =
    intersection.length === 0
      ? 0
      : (2 * intersection.length) /
        (2 * intersection.length + onlyA.length + onlyB.length);
  // Blend set overlap with partial ratios similar to token_set_ratio intent
  const score = Math.max(base, partial, ratio(combo1, combo2));
  return Math.round(score * 1000) / 10;
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.6) {
    return shorter.length / longer.length;
  }
  // Dice on bigrams
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      out.set(bg, (out.get(bg) ?? 0) + 1);
    }
    return out;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  let overlap = 0;
  for (const [k, v] of ba) overlap += Math.min(v, bb.get(k) ?? 0);
  return (2 * overlap) / Math.max(1, a.length - 1 + (b.length - 1));
}

type Teaching = {
  id: string;
  wording: string;
  topic: string | null;
  hash: string;
  norm: string;
};

type Occurrence = {
  id: string;
  wording: string;
  topic: string | null;
  hash: string;
  norm: string;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exitCode = 1;
    return;
  }
  const { dryRun, threshold, limit } = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: url });

  try {
    const teachingRes = await pool.query<{
      id: string;
      canonical_wording: string;
      topic: string | null;
      normalised_hash: string | null;
    }>(`
      SELECT id, canonical_wording, topic, normalised_hash
      FROM canonical.canonical_questions
      WHERE publishable = true
    `);
    const teaching: Teaching[] = teachingRes.rows.map((r) => ({
      id: r.id,
      wording: r.canonical_wording,
      topic: r.topic,
      hash: r.normalised_hash || normalisedHash(r.canonical_wording),
      norm: normalise(r.canonical_wording),
    }));
    const byHash = new Map<string, string>();
    for (const t of teaching) byHash.set(t.hash, t.id);

    const occRes = await pool.query<{
      id: string;
      wording: string;
      topic: string | null;
    }>(
      `
      SELECT o.id, coalesce(v.cleaned_wording, v.source_wording, '') AS wording, o.topic
      FROM canonical.question_occurrences o
      JOIN canonical.question_variants v ON v.id = o.question_variant_id
      WHERE o.canonical_question_id IS NULL
        AND length(coalesce(v.cleaned_wording, v.source_wording, '')) >= 12
      ORDER BY o.id
      ${limit && limit > 0 ? `LIMIT ${Math.trunc(limit)}` : ""}
      `,
    );
    const occurrences: Occurrence[] = occRes.rows.map((r) => ({
      id: r.id,
      wording: r.wording,
      topic: r.topic,
      hash: normalisedHash(r.wording),
      norm: normalise(r.wording),
    }));

    let exact = 0;
    let fuzzy = 0;
    let skipped = 0;
    const updates: Array<{ occId: string; cqId: string; score: number; reason: string }> =
      [];

    for (const occ of occurrences) {
      let cqId = byHash.get(occ.hash);
      let score = 100;
      let reason = "exact_hash";

      if (!cqId) {
        let bestScore = -1;
        let bestId: string | null = null;
        let bestTopicBonus = false;
        for (const t of teaching) {
          // Prefer same-topic; still allow cross-topic at higher bar
          const sameTopic =
            !!occ.topic &&
            !!t.topic &&
            occ.topic === t.topic &&
            occ.topic !== "untagged";
          const s = tokenSetRatio(occ.norm, t.norm);
          const need = sameTopic ? threshold : Math.min(95, threshold + 5);
          if (s < need) continue;
          if (
            s > bestScore ||
            (s === bestScore && sameTopic && !bestTopicBonus)
          ) {
            bestScore = s;
            bestId = t.id;
            bestTopicBonus = sameTopic;
          }
        }
        if (!bestId) {
          skipped++;
          continue;
        }
        cqId = bestId;
        score = bestScore;
        reason = "fuzzy_match";
      }

      if (reason === "exact_hash") exact++;
      else fuzzy++;
      updates.push({ occId: occ.id, cqId, score, reason });
    }

    console.log(
      JSON.stringify(
        {
          teaching: teaching.length,
          candidates: occurrences.length,
          matched: updates.length,
          exact,
          fuzzy,
          skipped,
          dryRun,
          threshold,
        },
        null,
        2,
      ),
    );

    if (dryRun || updates.length === 0) return;

    // Batch updates
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of updates) {
        await client.query(
          `
          UPDATE canonical.question_occurrences
          SET canonical_question_id = $1,
              confidence = GREATEST(COALESCE(confidence, 0), $2::float),
              updated_at = now()
          WHERE id = $3 AND canonical_question_id IS NULL
          `,
          [u.cqId, Math.min(1, u.score / 100), u.occId],
        );
      }
      await client.query("COMMIT");
      console.log(`updated ${updates.length} occurrences`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
