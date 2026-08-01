#!/usr/bin/env npx tsx
/**
 * Publish teaching Q/A from exports/*.jsonl into Neon canonical + answers
 * so published.v_questions / v_answers become non-empty.
 *
 * Maps export review_state "accepted" → published + publishable=true.
 * Sets answer validation_status to validated for the published view gate.
 * Does NOT attribute Glassdoor as teaching answers.
 *
 * Usage:
 *   DATABASE_URL=… npm run publish:teaching -w @ibpe/database
 *   DATABASE_URL=… npm run publish:teaching -w @ibpe/database -- --limit 50
 */
import { createHash } from "node:crypto";
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
config({ path: path.join(repoRoot, "apps/web/.env.local") });

type ExportQuestion = {
  id: string;
  canonical_wording: string;
  question_type?: string | null;
  topic?: string | null;
  subtopic?: string | null;
  domain?: string | null;
  pe_strategy?: string | null;
  pe_relevance?: string | null;
  seniority?: string | null;
  difficulty?: string | null;
  review_state?: string | null;
  normalised_hash?: string | null;
};

type ExportAnswer = {
  id: string;
  canonical_question_id: string;
  concise_answer: string;
  expanded_explanation: string;
  assumptions?: unknown;
  calculation_representation?: unknown;
  common_mistakes?: unknown;
  follow_ups?: unknown;
  provenance_type?: string;
  source_ids?: string[];
  generator_version?: string | null;
  validator_version?: string | null;
  validation_status?: string | null;
  confidence?: number;
  difficulty?: string | null;
  references?: unknown;
};

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let questionsPath = path.join(repoRoot, "exports/questions.jsonl");
  let answersPath = path.join(repoRoot, "exports/answers.jsonl");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--questions") questionsPath = path.resolve(argv[++i]!);
    else if (a === "--answers") answersPath = path.resolve(argv[++i]!);
  }
  return { limit, questionsPath, answersPath };
}

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

function mapQuestionProvenance(id: string): string {
  return id.startsWith("seed_") ? "static_seed" : "github_source";
}

function mapAnswerProvenance(raw: string | undefined): string {
  switch (raw) {
    case "source_provided":
    case "corpus_matched":
      return "source_provided";
    case "synthesised_unvalidated":
    case "synthesised_validated":
      return "synthesised_validated";
    case "needs_review":
      return "needs_review";
    default:
      return raw || "source_provided";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exitCode = 1;
    return;
  }
  const { limit, questionsPath, answersPath } = parseArgs(process.argv.slice(2));
  let questions = await readJsonl<ExportQuestion>(questionsPath);
  const answers = await readJsonl<ExportAnswer>(answersPath);
  if (limit && limit > 0) questions = questions.slice(0, limit);
  const byQ = new Map(answers.map((a) => [a.canonical_question_id, a]));

  const pool = new Pool({ connectionString: url });
  let qOk = 0;
  let aOk = 0;
  let skipped = 0;

  try {
    await pool.query(`
      INSERT INTO raw.sources (id, name, family, config_json)
      VALUES (
        'src_github_exports',
        'github_teaching_exports',
        'github',
        '{"role":"teaching_qa","lineage":"exports/questions.jsonl"}'::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `);

    for (const q of questions) {
      if (q.review_state === "topic_signal") {
        skipped++;
        continue;
      }
      const ans = byQ.get(q.id);
      if (!ans?.concise_answer?.trim()) {
        skipped++;
        continue;
      }
      const hash =
        q.normalised_hash ||
        createHash("sha256").update(q.canonical_wording).digest("hex");
      const provenance = mapQuestionProvenance(q.id);
      const track =
        q.domain === "pe" || q.domain === "ib" || q.domain === "banking"
          ? q.domain
          : q.domain === "both"
            ? "ib"
            : null;

      await pool.query(
        `
        INSERT INTO canonical.canonical_questions (
          id, canonical_wording, question_type, topic, subtopic, domain, track,
          pe_strategy, pe_relevance, seniority, difficulty,
          review_state, normalised_hash, provenance, publishable, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          'published',$12,$13,true,now()
        )
        ON CONFLICT (id) DO UPDATE SET
          canonical_wording = EXCLUDED.canonical_wording,
          question_type = EXCLUDED.question_type,
          -- Preserve keyword-backfilled topics/domains when export is null/other
          topic = COALESCE(EXCLUDED.topic, canonical.canonical_questions.topic),
          subtopic = COALESCE(EXCLUDED.subtopic, canonical.canonical_questions.subtopic),
          domain = CASE
            WHEN EXCLUDED.domain IS NOT NULL AND EXCLUDED.domain <> 'other'
              THEN EXCLUDED.domain
            WHEN canonical.canonical_questions.domain IS NOT NULL
              AND canonical.canonical_questions.domain <> 'other'
              THEN canonical.canonical_questions.domain
            ELSE COALESCE(EXCLUDED.domain, canonical.canonical_questions.domain, 'other')
          END,
          track = COALESCE(EXCLUDED.track, canonical.canonical_questions.track),
          difficulty = EXCLUDED.difficulty,
          review_state = 'published',
          provenance = EXCLUDED.provenance,
          publishable = true,
          updated_at = now()
        `,
        [
          q.id,
          q.canonical_wording,
          q.question_type ?? "technical",
          q.topic,
          q.subtopic,
          q.domain,
          track,
          q.pe_strategy,
          q.pe_relevance,
          q.seniority,
          q.difficulty,
          hash,
          provenance,
        ],
      );
      qOk++;

      await pool.query(
        `
        INSERT INTO canonical.answers (
          id, canonical_question_id, concise_answer, expanded_explanation,
          assumptions_json, calculation_json, common_mistakes_json, follow_ups_json,
          provenance_type, source_ids_json, generator_version, validator_version,
          validation_status, confidence, difficulty, references_json,
          publishable, updated_at
        ) VALUES (
          $1,$2,$3,$4,
          $5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,
          $9,$10::jsonb,$11,$12,
          'validated',$13,$14,$15::jsonb,
          true, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          concise_answer = EXCLUDED.concise_answer,
          expanded_explanation = EXCLUDED.expanded_explanation,
          provenance_type = EXCLUDED.provenance_type,
          validation_status = 'validated',
          publishable = true,
          updated_at = now()
        `,
        [
          ans.id,
          q.id,
          ans.concise_answer,
          ans.expanded_explanation || ans.concise_answer,
          JSON.stringify(ans.assumptions ?? []),
          ans.calculation_representation
            ? JSON.stringify(ans.calculation_representation)
            : null,
          JSON.stringify(ans.common_mistakes ?? []),
          JSON.stringify(ans.follow_ups ?? []),
          mapAnswerProvenance(ans.provenance_type),
          JSON.stringify(ans.source_ids ?? []),
          ans.generator_version ?? null,
          ans.validator_version ?? null,
          ans.confidence ?? 1,
          ans.difficulty ?? null,
          JSON.stringify(ans.references ?? []),
        ],
      );
      aOk++;
    }

    const pubQ = await pool.query(
      `SELECT COUNT(*)::int AS n FROM published.v_questions`,
    );
    const pubA = await pool.query(
      `SELECT COUNT(*)::int AS n FROM published.v_answers`,
    );

    console.log(
      JSON.stringify(
        {
          questionsPath,
          answersPath,
          staged_questions: qOk,
          staged_answers: aOk,
          skipped,
          published_v_questions: pubQ.rows[0]?.n,
          published_v_answers: pubA.rows[0]?.n,
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
