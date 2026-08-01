#!/usr/bin/env npx tsx
/**
 * Embed published teaching Q/A into canonical.rag_documents (pgvector).
 *
 * Requires: DATABASE_URL, GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
 * Run after publish:teaching + migrate 033.
 *
 *   npm run embed:rag -w @ibpe/database
 *   npm run embed:rag -w @ibpe/database -- --limit 50
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import {
  DEFAULT_EMBEDDING_MODEL,
  embedTexts,
  googleApiKey,
  toPgVectorLiteral,
} from "@ibpe/ai";

neonConfig.webSocketConstructor = ws;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
config({ path: path.join(repoRoot, ".env.local") });
config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(repoRoot, "apps/web/.env.local") });

type Row = {
  id: string;
  canonical_wording: string;
  topic: string | null;
  domain: string | null;
  difficulty: string | null;
  concise_answer: string;
  expanded_explanation: string;
  provenance_type: string;
};

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let batch = 16;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i]);
    if (argv[i] === "--batch") batch = Number(argv[++i]);
  }
  return { limit, batch };
}

function mapProvenance(raw: string): string {
  if (raw === "source_provided" || raw === "corpus_matched") return "github_source";
  if (raw.startsWith("synthes")) return "gemini_synthesised";
  if (raw === "editorial" || raw === "needs_review") return "editorial";
  return "github_source";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exitCode = 1;
    return;
  }
  if (!googleApiKey()) {
    console.error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required");
    process.exitCode = 1;
    return;
  }
  process.env.GOOGLE_GENERATIVE_AI_API_KEY =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  const { limit, batch } = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: url });

  try {
    const res = await pool.query<Row>(
      `
      SELECT
        q.id,
        q.canonical_wording,
        q.topic,
        q.domain,
        q.difficulty,
        a.concise_answer,
        a.expanded_explanation,
        a.provenance_type
      FROM published.v_questions q
      JOIN published.v_answers a ON a.canonical_question_id = q.id
      WHERE NOT EXISTS (
        SELECT 1 FROM canonical.rag_documents d
        WHERE d.id = q.id AND d.embedding IS NOT NULL
      )
      ORDER BY q.id
      ${limit && limit > 0 ? `LIMIT ${Number(limit)}` : ""}
      `,
    );
    const rows = res.rows;
    console.log(`Embedding ${rows.length} unpublished vectors (skipping existing)…`);

    let upserted = 0;
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      let vectors: number[][] | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          vectors = await embedTexts(chunk.map(
            (r) =>
              `${r.canonical_wording}\n\n${r.concise_answer}\n\n${r.expanded_explanation}`,
          ));
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const retryMatch = msg.match(/retry in ([\d.]+)s/i);
          const waitSec = retryMatch
            ? Math.ceil(Number(retryMatch[1]) + 2)
            : 60 * (attempt + 1);
          console.warn(
            `  rate-limited/error at ${i}; sleeping ${waitSec}s (attempt ${attempt + 1})`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
      }
      if (!vectors) throw new Error(`Failed to embed batch starting at ${i}`);
      for (let j = 0; j < chunk.length; j++) {
        const r = chunk[j]!;
        const emb = vectors[j]!;
        const body = `${r.concise_answer}\n\n${r.expanded_explanation}`;
        const contentHash = createHash("sha256")
          .update(`${r.canonical_wording}\n${body}`)
          .digest("hex");
        const provenance = mapProvenance(r.provenance_type);
        const literal = toPgVectorLiteral(emb);
        await pool.query(
          `
          INSERT INTO canonical.rag_documents (
            id, kind, canonical_question_id, title, body, topic, domain, difficulty,
            provenance, content_hash, embedding, model_id, updated_at
          ) VALUES (
            $1, 'canonical_question', $1, $2, $3, $4, $5, $6,
            $7, $8, $9::vector, $10, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            topic = EXCLUDED.topic,
            domain = EXCLUDED.domain,
            difficulty = EXCLUDED.difficulty,
            provenance = EXCLUDED.provenance,
            content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding,
            model_id = EXCLUDED.model_id,
            updated_at = now()
          `,
          [
            r.id,
            r.canonical_wording,
            body,
            r.topic,
            r.domain,
            r.difficulty,
            provenance,
            contentHash,
            literal,
            `google/${DEFAULT_EMBEDDING_MODEL}`,
          ],
        );
        upserted++;
      }
      console.log(`  … ${Math.min(i + batch, rows.length)}/${rows.length}`);
      // Free-tier pacing (~100 embed RPM)
      await new Promise((r) => setTimeout(r, 15_000));
    }

    // Diagram a11y / titles → rag_documents (concept retrieval, not Glassdoor).
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
    let diagramsUpserted = 0;
    for (const d of diagramRes.rows) {
      const body = [d.a11y_fallback ?? "", d.body ?? ""].filter(Boolean).join("\n\n");
      if (!body.trim()) continue;
      const text = `${d.title}\n\n${body}`;
      let vectors: number[][] | null = null;
      try {
        vectors = await embedTexts([text]);
      } catch (err) {
        console.warn(`[embed-rag] diagram ${d.id} failed`, err);
        continue;
      }
      const emb = vectors[0];
      if (!emb) continue;
      const contentHash = createHash("sha256").update(text).digest("hex");
      const literal = toPgVectorLiteral(emb);
      await pool.query(
        `
        INSERT INTO canonical.rag_documents (
          id, kind, canonical_question_id, title, body, topic, domain, difficulty,
          provenance, content_hash, embedding, model_id, updated_at
        ) VALUES (
          $1, 'diagram', NULL, $2, $3, NULL, NULL, NULL,
          'editorial', $4, $5::vector, $6, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          model_id = EXCLUDED.model_id,
          updated_at = now()
        `,
        [
          `diagram:${d.id}`,
          d.title,
          body,
          contentHash,
          literal,
          `google/${DEFAULT_EMBEDDING_MODEL}`,
        ],
      );
      diagramsUpserted++;
    }

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM canonical.rag_documents WHERE embedding IS NOT NULL`,
    );
    console.log(
      JSON.stringify(
        {
          upserted,
          diagrams_upserted: diagramsUpserted,
          embedded_rows: count.rows[0]?.n,
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
