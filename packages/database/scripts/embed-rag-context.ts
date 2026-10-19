#!/usr/bin/env npx tsx
/**
 * Embed supplemental RAG context (GitHub, static seed, Glassdoor wordings)
 * from exports/rag_context.jsonl into canonical.rag_documents.
 *
 * Requires: DATABASE_URL, GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
 *
 *   npm run embed:rag-context -w @ibpe/database
 *   npm run embed:rag-context -w @ibpe/database -- --limit 100
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

type RagRow = {
  id: string;
  text: string;
  provenance?: string;
  topic?: string | null;
  product_role?: string;
};

const ALLOWED_PROVENANCE = new Set([
  "licensed_guide",
  "github_source",
  "static_seed",
  "glassdoor_occurrence",
  "gemini_synthesised",
  "editorial",
]);

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let batch = 16;
  let input = path.join(repoRoot, "exports/rag_context.jsonl");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i]);
    if (argv[i] === "--batch") batch = Number(argv[++i]);
    if (argv[i] === "--input") input = path.resolve(argv[++i]!);
  }
  return { limit, batch, input };
}

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

function mapProvenance(raw: string | undefined): string {
  const p = raw || "github_source";
  return ALLOWED_PROVENANCE.has(p) ? p : "github_source";
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

  const { limit, batch, input } = parseArgs(process.argv.slice(2));
  let rows = await readJsonl<RagRow>(input);
  if (limit && limit > 0) rows = rows.slice(0, limit);

  const pool = new Pool({ connectionString: url });
  let upserted = 0;

  try {
    console.log(`Embedding ${rows.length} supplemental RAG rows from ${input}…`);
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const vectors = await embedTexts(chunk.map((r) => r.text));
      for (let j = 0; j < chunk.length; j++) {
        const r = chunk[j]!;
        const emb = vectors[j]!;
        const docId = `ragctx_${r.id}`;
        const contentHash = createHash("sha256").update(r.text).digest("hex");
        const provenance = mapProvenance(r.provenance);
        const title = r.text.slice(0, 120).replace(/\s+/g, " ");
        await pool.query(
          `
          INSERT INTO canonical.rag_documents (
            id, kind, canonical_question_id, title, body, topic, domain, difficulty,
            provenance, content_hash, embedding, model_id, metadata_json, updated_at
          ) VALUES (
            $1, 'answer_chunk', NULL, $2, $3, $4, NULL, NULL,
            $5, $6, $7::vector, $8, $9::jsonb, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            topic = EXCLUDED.topic,
            provenance = EXCLUDED.provenance,
            content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding,
            model_id = EXCLUDED.model_id,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = now()
          `,
          [
            docId,
            title,
            r.text,
            r.topic ?? null,
            provenance,
            contentHash,
            toPgVectorLiteral(emb),
            `google/${DEFAULT_EMBEDDING_MODEL}`,
            JSON.stringify({ product_role: r.product_role ?? "rag_context" }),
          ],
        );
        upserted++;
      }
      console.log(`  … ${Math.min(i + batch, rows.length)}/${rows.length}`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
    console.log(JSON.stringify({ upserted, input }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
