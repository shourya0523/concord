#!/usr/bin/env npx tsx
/**
 * Idempotent importer CLI — wraps @ibpe/database seedQuestionBank.
 *
 * Canonical implementation lives in packages/database (ibpe-database ownership).
 * This script is the apps/web entrypoint for Workstream D / ops docs.
 *
 * Usage (from repo root, with DATABASE_URL):
 *   npm run import:bank -w @ibpe/web -- --dry-run
 *   npm run import:bank -w @ibpe/web -- --limit 50
 *   npm run import:bank -w @ibpe/web -- --path data/question_bank.json
 *
 * Equivalent:
 *   npm run seed:bank -w @ibpe/database -- --dry-run
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

config({ path: path.join(repoRoot, ".env.local") });
config({ path: path.join(repoRoot, ".env") });

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main(): Promise<void> {
  const bankPath =
    argValue("--path") ?? path.join(repoRoot, "data/question_bank.json");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  const { loadQuestionBank, seedQuestionBank } = await import("@ibpe/database");

  if (dryRun) {
    const bank = await loadQuestionBank(bankPath);
    const n =
      limit && limit > 0
        ? Math.min(limit, bank.questions.length)
        : bank.questions.length;
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          bankPath,
          questions: n,
          sampleId: bank.questions[0]?.id ?? null,
          note: "Writes go to staging + question_occurrences (firm signals). Teaching answers are not created.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is required. Use --dry-run to validate the bank path without Neon.",
    );
    console.error(
      "Schema/migrations are owned by ibpe-database — run migrations before import.",
    );
    process.exitCode = 1;
    return;
  }

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const result = await seedQuestionBank(sql, { bankPath, limit });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
