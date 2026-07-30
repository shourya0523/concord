#!/usr/bin/env npx tsx
/**
 * Idempotent seed: data/question_bank.json → staging + question_occurrences.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { seedQuestionBank } from "../src/seed/seed-bank.js";

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

  if (dryRun) {
    const { loadQuestionBank } = await import("../src/seed/seed-bank.js");
    const bank = await loadQuestionBank(bankPath);
    const n = limit && limit > 0 ? Math.min(limit, bank.questions.length) : bank.questions.length;
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          bankPath,
          questions: n,
          sampleId: bank.questions[0]?.id ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required for seed:bank (Neon). Use --dry-run to validate the JSON path.");
    process.exitCode = 1;
    return;
  }

  const sql = neon(url);
  const result = await seedQuestionBank(sql, { bankPath, limit });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
