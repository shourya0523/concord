import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { BANK_SOURCE_ID, type BankQuestionRow } from "../field-map.js";
import {
  firmIdFromName,
  parseOptionalDate,
  parseOptionalTimestamptz,
  roleIdFromName,
  wordingHash,
} from "../ids.js";

export type QuestionBankFile = {
  version?: string | number;
  updated_at?: string;
  questions: BankQuestionRow[];
  completed_jobs?: unknown[];
};

export type SeedBankOptions = {
  bankPath: string;
  limit?: number;
  dryRun?: boolean;
};

export type SeedBankResult = {
  bankPath: string;
  inputCount: number;
  staged: number;
  firms: number;
  roles: number;
  variants: number;
  occurrences: number;
  runId: string;
  artifactId: string;
  jobKey: string;
};

function fileContentHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function loadQuestionBank(bankPath: string): Promise<QuestionBankFile> {
  const raw = await readFile(bankPath, "utf8");
  const data = JSON.parse(raw) as QuestionBankFile;
  if (!Array.isArray(data.questions)) {
    throw new Error(`Invalid bank file (missing questions[]): ${bankPath}`);
  }
  return data;
}

/**
 * Idempotent Glassdoor bank → staging + occurrence seed.
 * Uses legacy bank `id` hashes as ON CONFLICT keys. Does not create teaching answers.
 */
export async function seedQuestionBank(
  sql: NeonQueryFunction<false, false>,
  options: SeedBankOptions,
): Promise<SeedBankResult> {
  const absPath = path.resolve(options.bankPath);
  const buf = await readFile(absPath);
  const bank = JSON.parse(buf.toString("utf8")) as QuestionBankFile;
  const questions = (bank.questions ?? []).slice(
    0,
    options.limit && options.limit > 0 ? options.limit : undefined,
  );

  const contentHash = fileContentHash(buf);
  const runId = `run_bank_${contentHash.slice(0, 16)}`;
  const artifactId = `art_bank_${contentHash.slice(0, 16)}`;
  const jobKey = `seed_bank:${contentHash}`;
  const parserVersion = "bank_seed_v1";

  if (options.dryRun) {
    return {
      bankPath: absPath,
      inputCount: questions.length,
      staged: 0,
      firms: 0,
      roles: 0,
      variants: 0,
      occurrences: 0,
      runId,
      artifactId,
      jobKey,
    };
  }

  await sql`
    INSERT INTO admin.ingestion_jobs (
      idempotency_key, job_name, state, started_at, input_count, parser_or_model_version
    ) VALUES (
      ${jobKey}, 'seed_question_bank', 'running', now(), ${questions.length}, ${parserVersion}
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      state = 'running',
      started_at = now(),
      input_count = EXCLUDED.input_count,
      message = NULL
  `;

  await sql`
    INSERT INTO raw.sources (id, name, family, config_json)
    VALUES (
      ${BANK_SOURCE_ID},
      'glassdoor_question_bank',
      'glassdoor',
      ${JSON.stringify({ lineage: "glasscleaner2_question_bank", role: "firm_signal" })}::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO raw.source_runs (
      id, source_id, started_at, status, browser_mode, parser_version, metrics_json
    ) VALUES (
      ${runId},
      ${BANK_SOURCE_ID},
      now(),
      'running',
      'bank_seed',
      ${parserVersion},
      ${JSON.stringify({ bank_path: absPath, content_hash: contentHash })}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      status = 'running',
      metrics_json = EXCLUDED.metrics_json
  `;

  await sql`
    INSERT INTO raw.source_artifacts (
      id, source_id, source_run_id, url_or_path, retrieved_at,
      content_hash, parser_version, access_state, metadata_json
    ) VALUES (
      ${artifactId},
      ${BANK_SOURCE_ID},
      ${runId},
      ${absPath},
      now(),
      ${contentHash},
      ${parserVersion},
      'ok',
      ${JSON.stringify({ bank_updated_at: bank.updated_at ?? null, version: bank.version ?? null })}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      content_hash = EXCLUDED.content_hash,
      metadata_json = EXCLUDED.metadata_json
  `;

  const firmSeen = new Set<string>();
  const roleSeen = new Set<string>();
  let staged = 0;
  let variants = 0;
  let occurrences = 0;

  for (const q of questions) {
    if (!q?.id || !q.question) continue;

    const firmId = firmIdFromName(q.company || "Unknown");
    const roleId = roleIdFromName(q.position || "Unknown");
    const stagingId = `stg_${q.id}`;
    const variantId = `var_${q.id}`;
    const hash = wordingHash(q.question);
    const scrapedAt = parseOptionalTimestamptz(q.scraped_at);
    const interviewDate = parseOptionalDate(q.date_posted);
    const exact = q.question;
    const processText = q.process ?? null;

    if (!firmSeen.has(firmId)) {
      firmSeen.add(firmId);
      await sql`
        INSERT INTO canonical.firms (id, slug, name, track_focus)
        VALUES (${firmId}, ${firmId.replace(/^firm_/, "")}, ${q.company || "Unknown"}, ${q.track || null})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = now()
      `;
      await sql`
        INSERT INTO canonical.firm_aliases (id, firm_id, alias, source)
        VALUES (${`fa_${firmId}`}, ${firmId}, ${q.company || "Unknown"}, 'question_bank')
        ON CONFLICT (id) DO NOTHING
      `;
    }

    if (!roleSeen.has(roleId)) {
      roleSeen.add(roleId);
      await sql`
        INSERT INTO canonical.roles (id, slug, name, track)
        VALUES (${roleId}, ${roleId.replace(/^role_/, "")}, ${q.position || "Unknown"}, ${q.track || null})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `;
      await sql`
        INSERT INTO canonical.role_aliases (id, role_id, alias)
        VALUES (${`ra_${roleId}`}, ${roleId}, ${q.position || "Unknown"})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    await sql`
      INSERT INTO staging.staging_records (
        id, source_artifact_id, source_run_id, legacy_bank_id,
        exact_source_text, extracted_question, process_text,
        firm_raw, role_raw, track_raw, reported_date_raw,
        record_type, bank_payload_json, scraped_at, updated_at
      ) VALUES (
        ${stagingId},
        ${artifactId},
        ${runId},
        ${q.id},
        ${exact},
        ${q.question},
        ${processText},
        ${q.company || null},
        ${q.position || null},
        ${q.track || null},
        ${q.date_posted || null},
        'glassdoor_occurrence',
        ${JSON.stringify({
          user: q.user ?? null,
          experience: q.experience ?? null,
          process: q.process ?? null,
        })}::jsonb,
        ${scrapedAt},
        now()
      )
      ON CONFLICT (legacy_bank_id) DO UPDATE SET
        exact_source_text = EXCLUDED.exact_source_text,
        extracted_question = EXCLUDED.extracted_question,
        process_text = EXCLUDED.process_text,
        firm_raw = EXCLUDED.firm_raw,
        role_raw = EXCLUDED.role_raw,
        track_raw = EXCLUDED.track_raw,
        reported_date_raw = EXCLUDED.reported_date_raw,
        bank_payload_json = EXCLUDED.bank_payload_json,
        scraped_at = EXCLUDED.scraped_at,
        source_run_id = EXCLUDED.source_run_id,
        updated_at = now()
    `;
    staged += 1;

    await sql`
      INSERT INTO canonical.question_variants (
        id, source_wording, cleaned_wording, normalised_hash,
        variant_type, source_artifact_id, legacy_bank_id
      ) VALUES (
        ${variantId},
        ${q.question},
        ${q.question.trim()},
        ${hash},
        'glassdoor_bank',
        ${artifactId},
        ${q.id}
      )
      ON CONFLICT (legacy_bank_id) DO UPDATE SET
        source_wording = EXCLUDED.source_wording,
        cleaned_wording = EXCLUDED.cleaned_wording,
        normalised_hash = EXCLUDED.normalised_hash
    `;
    variants += 1;

    await sql`
      INSERT INTO canonical.question_occurrences (
        id, question_variant_id, staging_record_id, legacy_bank_id,
        firm_id, employer_raw, role_id, role_raw, track,
        interview_date, process_text, source_id, confidence, scraped_at, updated_at
      ) VALUES (
        ${q.id},
        ${variantId},
        ${stagingId},
        ${q.id},
        ${firmId},
        ${q.company || null},
        ${roleId},
        ${q.position || null},
        ${q.track || null},
        ${interviewDate},
        ${processText},
        ${BANK_SOURCE_ID},
        1.0,
        ${scrapedAt},
        now()
      )
      ON CONFLICT (legacy_bank_id) DO UPDATE SET
        question_variant_id = EXCLUDED.question_variant_id,
        staging_record_id = EXCLUDED.staging_record_id,
        firm_id = EXCLUDED.firm_id,
        employer_raw = EXCLUDED.employer_raw,
        role_id = EXCLUDED.role_id,
        role_raw = EXCLUDED.role_raw,
        track = EXCLUDED.track,
        interview_date = EXCLUDED.interview_date,
        process_text = EXCLUDED.process_text,
        scraped_at = EXCLUDED.scraped_at,
        updated_at = now()
    `;
    occurrences += 1;
  }

  await sql`
    UPDATE raw.source_runs
    SET status = 'succeeded', completed_at = now(),
        metrics_json = metrics_json || ${JSON.stringify({
          staged,
          firms: firmSeen.size,
          roles: roleSeen.size,
          variants,
          occurrences,
        })}::jsonb
    WHERE id = ${runId}
  `;

  await sql`
    UPDATE admin.ingestion_jobs
    SET state = 'succeeded',
        completed_at = now(),
        output_count = ${occurrences},
        metrics_json = ${JSON.stringify({
          staged,
          firms: firmSeen.size,
          roles: roleSeen.size,
          variants,
          occurrences,
        })}::jsonb
    WHERE idempotency_key = ${jobKey}
  `;

  return {
    bankPath: absPath,
    inputCount: questions.length,
    staged,
    firms: firmSeen.size,
    roles: roleSeen.size,
    variants,
    occurrences,
    runId,
    artifactId,
    jobKey,
  };
}
