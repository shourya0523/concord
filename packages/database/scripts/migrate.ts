#!/usr/bin/env npx tsx
/**
 * Apply Neon migrations 010+ via DATABASE_URL.
 * Uses neon Pool (Node + ws). Prefer direct (non-pooled) URL for DDL sessions.
 */
import { readFile } from "node:fs/promises";
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
config({ path: path.join(here, "../.env") });

const FILES = [
  "010_neon_platform.sql",
  "020_neon_published.sql",
  "030_neon_rls.sql",
  "031_neon_auth_user_id.sql",
  "032_learning_flows.sql",
  "033_rag_embeddings.sql",
  "034_occurrence_topic_backfill.sql",
  "035_diagram_resources_seed.sql",
  "036_keyword_rules_v2_backfill.sql",
  "037_heat_view_occurrence_topic.sql",
  "038_topic_rules_v3_and_domains.sql",
  "039_seed_checkpoint_questions.sql",
  "040_diagram_coverage_expand.sql",
] as const;

function splitSql(sqlText: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDollar = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];
    if (!inDollar && ch === "'" && sqlText[i - 1] !== "\\") {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (!inSingle && ch === "$" && next === "$") {
      inDollar = !inDollar;
      buf += "$$";
      i++;
      continue;
    }
    if (!inSingle && !inDollar && ch === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements.filter((s) => {
    const lines = s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"));
    return lines.length > 0;
  });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL not set — listing migrations only (not applied).",
    );
    for (const f of FILES) console.error(`  migrations/${f}`);
    process.exitCode = 0;
    return;
  }

  const pool = new Pool({ connectionString: url });
  const migrationsDir = path.join(repoRoot, "migrations");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const file of FILES) {
      const already = await pool.query(
        `SELECT 1 FROM public.schema_migrations WHERE filename = $1`,
        [file],
      );
      if (already.rowCount && already.rowCount > 0) {
        console.log(`Skip ${file} (already applied)`);
        continue;
      }

      const full = path.join(migrationsDir, file);
      const text = await readFile(full, "utf8");
      const statements = splitSql(text);
      console.log(`Applying ${file} (${statements.length} statements)…`);
      for (const stmt of statements) {
        // Strip leading comment-only lines so Pool gets executable SQL
        const executable = stmt
          .split("\n")
          .filter((line, _i, arr) => {
            const trimmed = line.trim();
            return true;
          })
          .join("\n")
          .replace(/^(?:\s*--[^\n]*\n)+/, "")
          .trim();
        if (!executable) continue;
        await pool.query(executable);
      }
      await pool.query(
        `INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file],
      );
      console.log(`  ok ${file}`);
    }

    // Always re-assert Mode A heat view (020 historically used q.topic only)
    const heatFix = await readFile(
      path.join(migrationsDir, "037_heat_view_occurrence_topic.sql"),
      "utf8",
    );
    for (const stmt of splitSql(heatFix)) {
      const executable = stmt.replace(/^(?:\s*--[^\n]*\n)+/, "").trim();
      if (executable) await pool.query(executable);
    }
    console.log("Re-asserted 037 heat view.");
    console.log("Neon migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
