#!/usr/bin/env npx tsx
/**
 * Embed published teaching content into canonical.rag_documents (pgvector).
 *
 * Document kinds (migration 033 CHECK):
 *   - canonical_question  question + concise (+ expanded when it adds text)
 *   - answer_chunk        expanded explanations split into ~800-char chunks
 *                         (skipped when expanded == concise or a chunk only
 *                         repeats the concise answer) — plan P2.6
 *   - concept             published concepts + their lesson checkpoint text
 *   - diagram             diagram titles + a11y fallbacks (migration 040)
 *
 * Requires: DATABASE_URL, GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
 * Run after publish:teaching + migrate 033.
 *
 *   npm run embed:rag -w @ibpe/database
 *   npm run embed:rag -w @ibpe/database -- --limit 50
 *   npm run embed:rag -w @ibpe/database -- --dry-run   # count docs, no key needed
 *   npm run embed:rag -w @ibpe/database -- --kinds canonical_question,answer_chunk
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { applyLocalNeonProxy } from "./local-neon";
import {
  DEFAULT_EMBEDDING_MODEL,
  embedTexts,
  googleApiKey,
  toPgVectorLiteral,
} from "@ibpe/ai";

neonConfig.webSocketConstructor = ws;
applyLocalNeonProxy();
if (process.env.NEON_FETCH_ENDPOINT) {
  // Dev / CI only: local HTTP SQL shim (scripts/dev/neon_http_shim.py).
  neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
  neonConfig.poolQueryViaFetch = true;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
config({ path: path.join(repoRoot, ".env.local") });
config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(repoRoot, "apps/web/.env.local") });

type Kind = "canonical_question" | "answer_chunk" | "concept" | "diagram";
const ALL_KINDS: Kind[] = ["canonical_question", "answer_chunk", "concept", "diagram"];
export const CHUNK_TARGET_CHARS = 800;

type Row = {
  id: string;
  canonical_wording: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  answer_id: string;
  concise_answer: string;
  expanded_explanation: string;
  provenance_type: string;
};

type RagDoc = {
  id: string;
  kind: "canonical_question" | "answer_chunk" | "concept" | "diagram";
  canonical_question_id: string | null;
  title: string;
  body: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  provenance: string;
  metadata: Record<string, unknown>;
};

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let batch = 16;
  let dryRun = false;
  let kinds: Kind[] = ALL_KINDS;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i]);
    else if (argv[i] === "--batch") batch = Number(argv[++i]);
    else if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--kinds") {
      kinds = String(argv[++i] ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter((k): k is Kind => (ALL_KINDS as string[]).includes(k));
    }
  }
  return { limit, batch, dryRun, kinds };
}

function mapProvenance(raw: string): string {
  if (raw === "source_provided" || raw === "corpus_matched") return "github_source";
  if (raw.startsWith("synthes")) return "gemini_synthesised";
  if (raw === "editorial" || raw === "needs_review") return "editorial";
  return "github_source";
}

export function normaliseText(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Question-doc body without repeating the concise answer inside the expanded one. */
export function answerBody(concise: string, expanded: string): string {
  const c = normaliseText(concise);
  const e = normaliseText(expanded);
  if (!e || e === c) return c;
  if (c && e.includes(c)) return e;
  return `${c}\n\n${e}`;
}

/**
 * Split text into ~target-char chunks on sentence boundaries (a single
 * over-long sentence becomes its own chunk). Pure + deterministic.
 */
export function chunkText(text: string, target = CHUNK_TARGET_CHARS): string[] {
  const body = normaliseText(text);
  if (!body) return [];
  if (body.length <= target) return [body];
  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z0-9$("“'])/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + 1 + s.length > target) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Answer chunks for one published answer: only when the expanded explanation
 * adds text beyond the concise answer; chunks that merely repeat the concise
 * answer are dropped (it is already in the canonical_question doc).
 */
export function answerChunks(concise: string, expanded: string, target = CHUNK_TARGET_CHARS): string[] {
  const c = normaliseText(concise);
  const e = normaliseText(expanded);
  if (!e || e === c) return [];
  const rest = c && e.startsWith(c) ? e.slice(c.length).trim() : e;
  if (!rest) return [];
  // Short expansions are already fully covered by the question doc body.
  if (e.length <= target) return [];
  return chunkText(rest, target).filter((chunk) => chunk !== c && !c.includes(chunk));
}

function contentHash(title: string, body: string): string {
  return createHash("sha256").update(`${title}\n${body}`).digest("hex");
}

async function embedWithRetry(texts: string[], label: string): Promise<number[][]> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await embedTexts(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryMatch = msg.match(/retry in ([\d.]+)s/i);
      const waitSec = retryMatch ? Math.ceil(Number(retryMatch[1]) + 2) : 60 * (attempt + 1);
      console.warn(`  rate-limited/error at ${label}; sleeping ${waitSec}s (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
  throw new Error(`Failed to embed batch ${label}`);
}

async function upsertDoc(pool: Pool, doc: RagDoc, embedding: number[]): Promise<void> {
  await pool.query(
    `
    INSERT INTO canonical.rag_documents (
      id, kind, canonical_question_id, title, body, topic, domain, difficulty,
      provenance, content_hash, embedding, model_id, metadata_json, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12, $13::jsonb, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind,
      canonical_question_id = EXCLUDED.canonical_question_id,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      topic = EXCLUDED.topic,
      domain = EXCLUDED.domain,
      difficulty = EXCLUDED.difficulty,
      provenance = EXCLUDED.provenance,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      model_id = EXCLUDED.model_id,
      metadata_json = EXCLUDED.metadata_json,
      updated_at = now()
    `,
    [
      doc.id,
      doc.kind,
      doc.canonical_question_id,
      doc.title,
      doc.body,
      doc.topic,
      doc.domain,
      doc.difficulty,
      doc.provenance,
      contentHash(doc.title, doc.body),
      toPgVectorLiteral(embedding),
      `google/${DEFAULT_EMBEDDING_MODEL}`,
      JSON.stringify(doc.metadata),
    ],
  );
}

async function buildTeachingDocs(pool: Pool, kinds: Kind[]): Promise<RagDoc[]> {
  const res = await pool.query<Row>(
    `
    SELECT q.id, q.canonical_wording, q.topic, q.domain, q.difficulty,
           a.id AS answer_id, a.concise_answer, a.expanded_explanation, a.provenance_type
    FROM published.v_questions q
    JOIN published.v_answers a ON a.canonical_question_id = q.id
    ORDER BY q.id
    `,
  );
  const docs: RagDoc[] = [];
  for (const r of res.rows) {
    const base = {
      canonical_question_id: r.id,
      title: r.canonical_wording,
      topic: r.topic,
      domain: r.domain,
      difficulty: r.difficulty,
      provenance: mapProvenance(r.provenance_type),
    };
    if (kinds.includes("canonical_question")) {
      docs.push({
        ...base,
        id: r.id,
        kind: "canonical_question",
        body: answerBody(r.concise_answer, r.expanded_explanation),
        metadata: { answer_id: r.answer_id },
      });
    }
    if (kinds.includes("answer_chunk")) {
      const chunks = answerChunks(r.concise_answer, r.expanded_explanation);
      chunks.forEach((body, i) => {
        docs.push({
          ...base,
          id: `chunk:${r.answer_id}:${i}`,
          kind: "answer_chunk",
          body,
          metadata: { answer_id: r.answer_id, chunk_index: i, chunk_count: chunks.length },
        });
      });
    }
  }
  return docs;
}

async function buildConceptDocs(pool: Pool): Promise<RagDoc[]> {
  type ConceptRow = {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    track: string | null;
    lesson_text: string | null;
  };
  const res = await pool.query<ConceptRow>(
    `
    SELECT c.id, c.slug, c.title, c.summary, c.track,
           string_agg(cp.body_markdown, E'\n\n' ORDER BY cp.position)
             FILTER (WHERE coalesce(cp.body_markdown, '') <> '') AS lesson_text
    FROM published.v_concepts c
    LEFT JOIN canonical.learning_module_checkpoints cp ON cp.concept_id = c.id
    GROUP BY c.id, c.slug, c.title, c.summary, c.track
    ORDER BY c.id
    `,
  );
  return res.rows
    .map((c) => {
      const body = [c.summary ?? "", c.lesson_text ?? ""]
        .map(normaliseText)
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4000);
      return {
        id: `concept:${c.id}`,
        kind: "concept" as const,
        canonical_question_id: null,
        title: c.title,
        body,
        topic: null,
        domain: c.track,
        difficulty: null,
        provenance: "editorial",
        metadata: { concept_id: c.id, slug: c.slug },
      };
    })
    .filter((d) => d.body.length > 0);
}

/** Skip docs whose embedded content hash is unchanged. */
async function pendingDocs(pool: Pool, docs: RagDoc[]): Promise<RagDoc[]> {
  if (!docs.length) return [];
  const res = await pool.query<{ id: string; content_hash: string }>(
    `SELECT id, content_hash FROM canonical.rag_documents
     WHERE embedding IS NOT NULL AND id = ANY($1::text[])`,
    [docs.map((d) => d.id)],
  );
  const have = new Map(res.rows.map((r) => [r.id, r.content_hash]));
  return docs.filter((d) => have.get(d.id) !== contentHash(d.title, d.body));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exitCode = 1;
    return;
  }
  const { limit, batch, dryRun, kinds } = parseArgs(process.argv.slice(2));
  if (!dryRun && !googleApiKey()) {
    console.error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required (or pass --dry-run)");
    process.exitCode = 1;
    return;
  }
  process.env.GOOGLE_GENERATIVE_AI_API_KEY =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  const pool = new Pool({ connectionString: url });

  try {
    const teaching = await buildTeachingDocs(pool, kinds);
    const concepts = kinds.includes("concept") ? await buildConceptDocs(pool) : [];
    let docs = await pendingDocs(pool, [...teaching, ...concepts]);
    if (limit && limit > 0) docs = docs.slice(0, limit);
    const byKind = docs.reduce<Record<string, number>>((acc, d) => {
      acc[d.kind] = (acc[d.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`Embedding ${docs.length} changed/new docs…`, byKind);

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            dry_run: true,
            candidate_docs: teaching.length + concepts.length,
            pending_docs: docs.length,
            by_kind: byKind,
            sample: docs.slice(0, 3).map((d) => ({ id: d.id, kind: d.kind, chars: d.body.length })),
          },
          null,
          2,
        ),
      );
      return;
    }

    // Drop answer chunks that no longer exist (answer shortened / unpublished).
    let staleChunks = 0;
    if (kinds.includes("answer_chunk") && !(limit && limit > 0)) {
      const current = teaching.filter((d) => d.kind === "answer_chunk").map((d) => d.id);
      const del = await pool.query(
        `DELETE FROM canonical.rag_documents
         WHERE kind = 'answer_chunk' AND NOT (id = ANY($1::text[]))`,
        [current],
      );
      staleChunks = del.rowCount ?? 0;
    }

    let upserted = 0;
    for (let i = 0; i < docs.length; i += batch) {
      const chunk = docs.slice(i, i + batch);
      const vectors = await embedWithRetry(
        chunk.map((d) => `${d.title}\n\n${d.body}`),
        String(i),
      );
      for (let j = 0; j < chunk.length; j++) {
        const emb = vectors[j];
        if (!emb) continue;
        await upsertDoc(pool, chunk[j]!, emb);
        upserted++;
      }
      console.log(`  … ${Math.min(i + batch, docs.length)}/${docs.length}`);
      // Free-tier pacing (~100 embed RPM)
      await new Promise((r) => setTimeout(r, 15_000));
    }

    // Diagram a11y / titles → rag_documents (concept retrieval, not Glassdoor).
    let diagramsUpserted = 0;
    if (kinds.includes("diagram")) {
      type DiagramRow = {
        id: string;
        title: string;
        a11y_fallback: string | null;
        body: string | null;
      };
      const diagramRes = await pool.query<DiagramRow>(
        `
        SELECT d.id, d.title, d.a11y_fallback, v.body
        FROM canonical.diagrams d
        LEFT JOIN LATERAL (
          SELECT body FROM canonical.diagram_versions dv
          WHERE dv.diagram_id = d.id
          ORDER BY dv.created_at DESC NULLS LAST
          LIMIT 1
        ) v ON true
        WHERE NOT EXISTS (
          SELECT 1 FROM canonical.rag_documents r
          WHERE r.id = ('diagram:' || d.id) AND r.embedding IS NOT NULL
        )
        ${limit && limit > 0 ? `LIMIT ${Number(limit)}` : ""}
        `,
      );
      for (const d of diagramRes.rows) {
        const body = [d.a11y_fallback ?? "", d.body ?? ""].filter(Boolean).join("\n\n");
        if (!body.trim()) continue;
        let vectors: number[][] | null = null;
        try {
          vectors = await embedTexts([`${d.title}\n\n${body}`]);
        } catch (err) {
          console.warn(`[embed-rag] diagram ${d.id} failed`, err);
          continue;
        }
        const emb = vectors[0];
        if (!emb) continue;
        await upsertDoc(
          pool,
          {
            id: `diagram:${d.id}`,
            kind: "diagram",
            canonical_question_id: null,
            title: d.title,
            body,
            topic: null,
            domain: null,
            difficulty: null,
            provenance: "editorial",
            metadata: { diagram_id: d.id, source: "diagram" },
          },
          emb,
        );
        diagramsUpserted++;
      }
    }

    const count = await pool.query(
      `SELECT kind, COUNT(*)::int AS n FROM canonical.rag_documents
       WHERE embedding IS NOT NULL GROUP BY kind ORDER BY kind`,
    );
    console.log(
      JSON.stringify(
        {
          upserted,
          by_kind: byKind,
          stale_chunks_removed: staleChunks,
          diagrams_upserted: diagramsUpserted,
          embedded_rows: count.rows,
          model: DEFAULT_EMBEDDING_MODEL,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
