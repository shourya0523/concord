#!/usr/bin/env npx tsx
/**
 * Apply Neon migrations 010 → 020 → 030 via DATABASE_URL.
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
    for (const file of FILES) {
      const full = path.join(migrationsDir, file);
      const text = await readFile(full, "utf8");
      const statements = splitSql(text);
      console.log(`Applying ${file} (${statements.length} statements)…`);
      for (const stmt of statements) {
        await pool.query(stmt);
      }
      console.log(`  ok ${file}`);
    }
    console.log("Neon migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
