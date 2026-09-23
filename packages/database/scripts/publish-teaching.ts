#!/usr/bin/env npx tsx
/**
 * Publish teaching Q/A from exports/*.jsonl into Neon canonical + answers
 * so published.v_questions / v_answers become non-empty.
 *
 * Maps export review_state "accepted" → published + publishable=true.
 * Sets answer validation_status to validated for the published view gate.
 * Does NOT attribute Glassdoor as teaching answers.
 *
 * Plan 2026-09-23-001 additions:
 *   - answers carry rubric_json / rubric_status (AnswerRubricSchema, migration 044)
 *   - generic placeholder answers ("Structure a clear interview answer to: …")
 *     are retired (publishable=false) and never re-published
 *   - exports/enrichment_proposals.jsonl is upserted into staging.enrichment_proposals;
 *     only approved rows (human or auto) are applied, then marked `applied`.
 *     A human decision already in the DB is never overwritten by a re-run.
 *   - exports/occurrence_joins.jsonl sets question_occurrences canonical_question_id /
 *     join_score / join_method / topic for Glassdoor firm signals (never answers)
 *   - --retire-missing unpublishes teaching questions no longer in the export
 *
 * Usage:
 *   DATABASE_URL=… npm run publish:teaching -w @ibpe/database
 *   DATABASE_URL=… npm run publish:teaching -w @ibpe/database -- --limit 50
 *   … -- --skip-proposals --skip-joins --retire-missing
 *
 * Local verification (no Neon): run scripts/dev/neon_http_shim.py and set
 * NEON_FETCH_ENDPOINT=http://127.0.0.1:<port>/sql — queries then go over HTTP.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { applyLocalNeonProxy } from "./local-neon";

neonConfig.webSocketConstructor = ws;
applyLocalNeonProxy();
if (process.env.NEON_FETCH_ENDPOINT) {
  // Dev / CI only: route Pool.query through an HTTP SQL endpoint (local shim).
  neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
  neonConfig.poolQueryViaFetch = true;
}

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
  provenance?: string | null;
};

type ExportRubric = {
  review_status?: "pending" | "approved" | "rejected";
  [key: string]: unknown;
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
  rubric?: ExportRubric | null;
};

type ExportProposal = {
  id: string;
  target_kind: string;
  target_id: string;
  field: string;
  proposal_json: { value?: unknown; [key: string]: unknown };
  current_json?: unknown;
  model?: string | null;
  prompt_version?: string | null;
  confidence?: number | null;
  status: "pending" | "approved" | "rejected" | "applied";
  auto_approved?: boolean;
  reviewer?: string | null;
  review_note?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

type OccurrenceJoin = {
  signal_hash: string;
  signal_text: string;
  topic?: string | null;
  canonical_question_id?: string | null;
  join_score?: number | null;
  join_method?: "exact" | "fuzzy" | "embedding" | "manual" | null;
};

const PLACEHOLDER_SQL_RE = "^\\s*structure a clear interview answer to\\s*:";
const PLACEHOLDER_RE = /^\s*structure a clear interview answer to\s*:/i;
const QUESTION_FIELDS = new Set(["topic", "domain", "difficulty"]);
const TEACHING_PROVENANCE = new Set([
  "github_source",
  "static_seed",
  "gemini_synthesised",
  "editorial",
]);
const BATCH = 250;

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let questionsPath = path.join(repoRoot, "exports/questions.jsonl");
  let answersPath = path.join(repoRoot, "exports/answers.jsonl");
  let proposalsPath = path.join(repoRoot, "exports/enrichment_proposals.jsonl");
  let joinsPath = path.join(repoRoot, "exports/occurrence_joins.jsonl");
  let skipProposals = false;
  let skipJoins = false;
  let retireMissing = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--questions") questionsPath = path.resolve(argv[++i]!);
    else if (a === "--answers") answersPath = path.resolve(argv[++i]!);
    else if (a === "--proposals") proposalsPath = path.resolve(argv[++i]!);
    else if (a === "--occurrence-joins") joinsPath = path.resolve(argv[++i]!);
    else if (a === "--skip-proposals") skipProposals = true;
    else if (a === "--skip-joins") skipJoins = true;
    else if (a === "--retire-missing") retireMissing = true;
  }
  return {
    limit,
    questionsPath,
    answersPath,
    proposalsPath,
    joinsPath,
    skipProposals,
    skipJoins,
    retireMissing,
  };
}

async function readJsonl<T>(file: string): Promise<T[]> {
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export function mapQuestionProvenance(q: Pick<ExportQuestion, "id" | "provenance">): string {
  if (q.provenance && TEACHING_PROVENANCE.has(q.provenance)) return q.provenance;
  return q.id.startsWith("seed_") ? "static_seed" : "github_source";
}

export function mapAnswerProvenance(raw: string | undefined): string {
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

export function isPublishableAnswer(a: ExportAnswer): boolean {
  if (!a.concise_answer?.trim()) return false;
  if (PLACEHOLDER_RE.test(a.concise_answer)) return false;
  if (a.validation_status === "needs_generation") return false;
  if (a.provenance_type === "rejected") return false;
  return true;
}

export function rubricStatus(a: ExportAnswer): string | null {
  const s = a.rubric?.review_status;
  return s === "approved" || s === "pending" || s === "rejected" ? s : null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function upsertProposals(pool: Pool, proposals: ExportProposal[]): Promise<number> {
  let n = 0;
  for (const batch of chunks(proposals, BATCH)) {
    const rows = batch.map((p) => ({
      id: p.id,
      target_kind: p.target_kind,
      target_id: p.target_id,
      field: p.field,
      proposal_json: p.proposal_json,
      current_json: p.current_json ?? null,
      model: p.model ?? null,
      prompt_version: p.prompt_version ?? null,
      confidence: p.confidence ?? null,
      status: p.status === "applied" ? "approved" : p.status,
      auto_approved: Boolean(p.auto_approved),
      reviewer: p.reviewer ?? null,
      review_note: p.review_note ?? null,
      decided_at: p.decided_at ?? null,
    }));
    // A human decision (reviewer not auto:*) or an already-applied row keeps its
    // status; only the proposed payload is refreshed.
    const res = await pool.query(
      `
      INSERT INTO staging.enrichment_proposals (
        id, target_kind, target_id, field, proposal_json, current_json, model,
        prompt_version, confidence, status, auto_approved, reviewer, review_note, decided_at
      )
      SELECT id, target_kind, target_id, field, proposal_json, current_json, model,
             prompt_version, confidence, status, auto_approved, reviewer, review_note, decided_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text, target_kind text, target_id text, field text, proposal_json jsonb,
        current_json jsonb, model text, prompt_version text, confidence double precision,
        status text, auto_approved boolean, reviewer text, review_note text, decided_at timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        proposal_json = EXCLUDED.proposal_json,
        current_json = EXCLUDED.current_json,
        model = EXCLUDED.model,
        confidence = EXCLUDED.confidence,
        status = CASE
          WHEN staging.enrichment_proposals.status = 'applied' THEN 'applied'
          WHEN staging.enrichment_proposals.reviewer IS NOT NULL
            AND staging.enrichment_proposals.reviewer NOT LIKE 'auto:%'
            THEN staging.enrichment_proposals.status
          ELSE EXCLUDED.status
        END,
        auto_approved = CASE
          WHEN staging.enrichment_proposals.reviewer IS NOT NULL
            AND staging.enrichment_proposals.reviewer NOT LIKE 'auto:%'
            THEN staging.enrichment_proposals.auto_approved
          ELSE EXCLUDED.auto_approved
        END,
        reviewer = CASE
          WHEN staging.enrichment_proposals.reviewer IS NOT NULL
            AND staging.enrichment_proposals.reviewer NOT LIKE 'auto:%'
            THEN staging.enrichment_proposals.reviewer
          ELSE EXCLUDED.reviewer
        END,
        decided_at = COALESCE(staging.enrichment_proposals.decided_at, EXCLUDED.decided_at)
      `,
      [JSON.stringify(rows)],
    );
    n += res.rowCount ?? 0;
  }
  return n;
}

/** Apply approved proposals (question topic/domain/difficulty, answer expansions). */
async function applyApprovedProposals(pool: Pool): Promise<{ questions: number; answers: number }> {
  const q = await pool.query(
    `
    WITH approved AS (
      SELECT p.id, p.target_id, p.field, p.proposal_json->>'value' AS value,
             (p.reviewer IS NOT NULL AND p.reviewer NOT LIKE 'auto:%') AS human
      FROM staging.enrichment_proposals p
      WHERE p.status = 'approved' AND p.target_kind = 'question'
        AND p.field IN ('topic', 'domain', 'difficulty')
        AND p.proposal_json->>'value' IS NOT NULL
    ),
    -- One row per question so every approved field lands in a single UPDATE.
    agg AS (
      SELECT target_id,
             max(value) FILTER (WHERE field = 'topic') AS topic,
             coalesce(bool_or(human) FILTER (WHERE field = 'topic'), false) AS topic_human,
             max(value) FILTER (WHERE field = 'domain') AS domain,
             coalesce(bool_or(human) FILTER (WHERE field = 'domain'), false) AS domain_human,
             max(value) FILTER (WHERE field = 'difficulty') AS difficulty,
             coalesce(bool_or(human) FILTER (WHERE field = 'difficulty'), false) AS difficulty_human,
             array_agg(id) AS ids
      FROM approved
      GROUP BY target_id
    ),
    upd AS (
      UPDATE canonical.canonical_questions c
      SET topic = CASE WHEN a.topic IS NOT NULL
                        AND (a.topic_human OR c.topic IS NULL OR c.topic = 'untagged')
                       THEN a.topic ELSE c.topic END,
          domain = CASE WHEN a.domain IS NOT NULL
                         AND (a.domain_human OR c.domain IS NULL OR c.domain = 'other')
                        THEN a.domain ELSE c.domain END,
          track = CASE WHEN a.domain IN ('ib', 'pe')
                         AND (a.domain_human OR c.track IS NULL)
                        THEN a.domain ELSE c.track END,
          difficulty = CASE WHEN a.difficulty IS NOT NULL
                             AND (a.difficulty_human OR c.difficulty IS NULL)
                            THEN a.difficulty ELSE c.difficulty END,
          updated_at = now()
      FROM agg a
      WHERE c.id = a.target_id
      RETURNING a.ids
    )
    UPDATE staging.enrichment_proposals p
    SET status = 'applied', decided_at = COALESCE(p.decided_at, now())
    WHERE p.id IN (SELECT unnest(ids) FROM upd)
    `,
  );
  const a = await pool.query(
    `
    WITH approved AS (
      SELECT p.id, p.target_id, p.proposal_json->>'value' AS value
      FROM staging.enrichment_proposals p
      WHERE p.status = 'approved' AND p.target_kind = 'answer'
        AND p.field = 'expanded_explanation'
        AND coalesce(p.proposal_json->>'value', '') <> ''
    ),
    upd AS (
      UPDATE canonical.answers x
      SET expanded_explanation = a.value, updated_at = now()
      FROM approved a
      WHERE x.id = a.target_id
      RETURNING a.id
    )
    UPDATE staging.enrichment_proposals p
    SET status = 'applied', decided_at = COALESCE(p.decided_at, now())
    WHERE p.id IN (SELECT id FROM upd)
    `,
  );
  return { questions: q.rowCount ?? 0, answers: a.rowCount ?? 0 };
}

/** Firm-signal joins: occurrence → teaching canonical + topic (never answers). */
async function applyOccurrenceJoins(pool: Pool, joins: OccurrenceJoin[]): Promise<number> {
  let n = 0;
  for (const batch of chunks(joins, BATCH)) {
    const rows = batch.map((j) => ({
      signal_hash: j.signal_hash,
      signal_text: j.signal_text,
      topic: j.topic && j.topic !== "untagged" ? j.topic : null,
      canonical_question_id: j.canonical_question_id ?? null,
      join_score: j.join_score ?? null,
      join_method: j.join_method ?? null,
    }));
    const res = await pool.query(
      `
      WITH j AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          signal_hash text, signal_text text, topic text,
          canonical_question_id text, join_score double precision, join_method text
        )
      ),
      matched AS (
        SELECT DISTINCT ON (o.id) o.id AS occurrence_id, j.*
        FROM canonical.question_occurrences o
        JOIN canonical.question_variants v ON v.id = o.question_variant_id
        JOIN j ON v.normalised_hash = j.signal_hash
               OR lower(btrim(v.cleaned_wording)) = lower(btrim(j.signal_text))
        ORDER BY o.id, j.join_score DESC NULLS LAST
      )
      UPDATE canonical.question_occurrences o
      SET canonical_question_id = CASE
            WHEN m.canonical_question_id IS NOT NULL
              AND coalesce(o.join_method, '') <> 'manual'
              AND EXISTS (SELECT 1 FROM canonical.canonical_questions c WHERE c.id = m.canonical_question_id)
            THEN m.canonical_question_id ELSE o.canonical_question_id END,
          join_score = CASE
            WHEN m.canonical_question_id IS NOT NULL AND coalesce(o.join_method, '') <> 'manual'
              AND EXISTS (SELECT 1 FROM canonical.canonical_questions c WHERE c.id = m.canonical_question_id)
            THEN m.join_score ELSE o.join_score END,
          join_method = CASE
            WHEN m.canonical_question_id IS NOT NULL AND coalesce(o.join_method, '') <> 'manual'
              AND EXISTS (SELECT 1 FROM canonical.canonical_questions c WHERE c.id = m.canonical_question_id)
            THEN m.join_method ELSE o.join_method END,
          topic = CASE WHEN coalesce(o.topic, 'untagged') = 'untagged' AND m.topic IS NOT NULL
                       THEN m.topic ELSE o.topic END,
          updated_at = now()
      FROM matched m
      WHERE o.id = m.occurrence_id
      `,
      [JSON.stringify(rows)],
    );
    n += res.rowCount ?? 0;
  }
  return n;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exitCode = 1;
    return;
  }
  const opts = parseArgs(process.argv.slice(2));
  let questions = await readJsonl<ExportQuestion>(opts.questionsPath);
  const answers = await readJsonl<ExportAnswer>(opts.answersPath);
  if (opts.limit && opts.limit > 0) questions = questions.slice(0, opts.limit);
  const byQ = new Map(answers.map((a) => [a.canonical_question_id, a]));

  const pool = new Pool({ connectionString: url });
  let qOk = 0;
  let aOk = 0;
  let rubricsOk = 0;
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

    // Never serve the generic synthesis placeholder, even if an older export published it.
    const retiredPlaceholders = await pool.query(
      `UPDATE canonical.answers SET publishable = false, updated_at = now()
       WHERE publishable = true AND concise_answer ~* $1`,
      [PLACEHOLDER_SQL_RE],
    );

    for (const q of questions) {
      if (q.review_state === "topic_signal") {
        skipped++;
        continue;
      }
      const ans = byQ.get(q.id);
      if (!ans || !isPublishableAnswer(ans)) {
        skipped++;
        continue;
      }
      const hash =
        q.normalised_hash ||
        createHash("sha256").update(q.canonical_wording).digest("hex");
      const provenance = mapQuestionProvenance(q);
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
          difficulty = COALESCE(EXCLUDED.difficulty, canonical.canonical_questions.difficulty),
          normalised_hash = EXCLUDED.normalised_hash,
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

      const rubric = ans.rubric ?? null;
      await pool.query(
        `
        INSERT INTO canonical.answers (
          id, canonical_question_id, concise_answer, expanded_explanation,
          assumptions_json, calculation_json, common_mistakes_json, follow_ups_json,
          provenance_type, source_ids_json, generator_version, validator_version,
          validation_status, confidence, difficulty, references_json,
          rubric_json, rubric_status, publishable, updated_at
        ) VALUES (
          $1,$2,$3,$4,
          $5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,
          $9,$10::jsonb,$11,$12,
          'validated',$13,$14,$15::jsonb,
          $16::jsonb,$17, true, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          concise_answer = EXCLUDED.concise_answer,
          expanded_explanation = EXCLUDED.expanded_explanation,
          assumptions_json = EXCLUDED.assumptions_json,
          calculation_json = EXCLUDED.calculation_json,
          common_mistakes_json = EXCLUDED.common_mistakes_json,
          follow_ups_json = EXCLUDED.follow_ups_json,
          provenance_type = EXCLUDED.provenance_type,
          source_ids_json = EXCLUDED.source_ids_json,
          generator_version = EXCLUDED.generator_version,
          validator_version = EXCLUDED.validator_version,
          confidence = EXCLUDED.confidence,
          difficulty = EXCLUDED.difficulty,
          references_json = EXCLUDED.references_json,
          -- Keep a human-approved rubric over a regenerated heuristic one.
          rubric_json = CASE
            WHEN canonical.answers.rubric_json->>'provenance' = 'human'
              THEN canonical.answers.rubric_json
            ELSE EXCLUDED.rubric_json
          END,
          rubric_status = CASE
            WHEN canonical.answers.rubric_json->>'provenance' = 'human'
              THEN canonical.answers.rubric_status
            ELSE EXCLUDED.rubric_status
          END,
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
          rubric ? JSON.stringify(rubric) : null,
          rubricStatus(ans),
        ],
      );
      aOk++;
      if (rubricStatus(ans) === "approved") rubricsOk++;
    }

    let retiredMissing = 0;
    if (opts.retireMissing && !opts.limit) {
      const ids = questions.map((q) => q.id);
      const res = await pool.query(
        `
        WITH retired AS (
          UPDATE canonical.canonical_questions
          SET publishable = false, updated_at = now()
          WHERE publishable = true
            AND provenance IN ('github_source', 'static_seed')
            AND NOT (id = ANY($1::text[]))
          RETURNING id
        )
        UPDATE canonical.answers a SET publishable = false, updated_at = now()
        WHERE a.canonical_question_id IN (SELECT id FROM retired)
        `,
        [ids],
      );
      retiredMissing = res.rowCount ?? 0;
    }

    let proposalsUpserted = 0;
    let applied = { questions: 0, answers: 0 };
    if (!opts.skipProposals) {
      const proposals = await readJsonl<ExportProposal>(opts.proposalsPath);
      proposalsUpserted = await upsertProposals(pool, proposals);
      applied = await applyApprovedProposals(pool);
    }

    let joinsApplied = 0;
    if (!opts.skipJoins) {
      const joins = await readJsonl<OccurrenceJoin>(opts.joinsPath);
      joinsApplied = await applyOccurrenceJoins(pool, joins);
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
          questionsPath: opts.questionsPath,
          answersPath: opts.answersPath,
          staged_questions: qOk,
          staged_answers: aOk,
          approved_rubrics: rubricsOk,
          skipped,
          retired_placeholder_answers: retiredPlaceholders.rowCount ?? 0,
          retired_missing_rows: retiredMissing,
          proposals_upserted: proposalsUpserted,
          proposals_applied: applied,
          occurrence_rows_updated: joinsApplied,
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
