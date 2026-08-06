/**
 * Firm catalog + occurrence signal reads — the real Mode A backend.
 * Replaces the hardcoded mock firm list with the 43-firm canonical catalog.
 */
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { loadBankQuestions } from "./bank-fallback";

export const FirmCatalogItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  track: z.string().nullable(),
  /** Glassdoor occurrence volume for this firm. */
  signals: z.number().int().nonnegative(),
});
export type FirmCatalogItem = z.infer<typeof FirmCatalogItemSchema>;

export const FirmCatalogResponseSchema = z.object({
  items: z.array(FirmCatalogItemSchema),
  source: z.enum(["published", "bank_fallback", "empty"]),
  note: z.string().optional(),
});
export type FirmCatalogResponse = z.infer<typeof FirmCatalogResponseSchema>;

export const CompanySignalSchema = z.object({
  occurrence_id: z.string(),
  firm_id: z.string(),
  firm_slug: z.string().nullable(),
  role: z.string().nullable(),
  track: z.string().nullable(),
  topic: z.string().nullable(),
  round: z.string().nullable(),
  interview_date: z.string().nullable(),
  question: z.string(),
  has_teaching_answer: z.boolean(),
});
export type CompanySignal = z.infer<typeof CompanySignalSchema>;

export const CompanySignalsResponseSchema = z.object({
  items: z.array(CompanySignalSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  source: z.enum(["published", "bank_fallback", "empty"]),
  note: z.string().optional(),
});
export type CompanySignalsResponse = z.infer<typeof CompanySignalsResponseSchema>;

type FirmRow = {
  id: string;
  slug: string;
  name: string;
  track_focus: string | null;
  signals: number | string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function listBankFirmCatalog(): Promise<FirmCatalogResponse> {
  try {
    const rows = await loadBankQuestions();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = row.company?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const items = [...counts.entries()]
      .map(([name, signals]) =>
        FirmCatalogItemSchema.parse({
          id: `firm_${slugify(name)}`,
          slug: slugify(name),
          name,
          track: null,
          signals,
        }),
      )
      .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name));
    return {
      items,
      source: items.length ? "bank_fallback" : "empty",
      note: items.length
        ? "Showing firms from the local interview bank (database not connected)."
        : "No firm interview reports available yet.",
    };
  } catch (err) {
    console.warn("[catalog] bank firm catalog failed", err);
    return { items: [], source: "empty", note: "Firm list unavailable right now." };
  }
}

export async function listFirmCatalog(): Promise<FirmCatalogResponse> {
  if (!isDatabaseConfigured()) return listBankFirmCatalog();

  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT
        f.id,
        f.slug,
        f.name,
        f.track_focus,
        count(o.id)::int AS signals
      FROM canonical.firms f
      LEFT JOIN canonical.question_occurrences o ON o.firm_id = f.id
      GROUP BY f.id, f.slug, f.name, f.track_focus
      ORDER BY signals DESC, f.name ASC
      LIMIT 200
    `) as FirmRow[];

    const items = rows.map((row) =>
      FirmCatalogItemSchema.parse({
        id: row.id,
        slug: row.slug,
        name: row.name,
        track: row.track_focus,
        signals: Number(row.signals),
      }),
    );
    return { items, source: items.length ? "published" : "empty" };
  } catch (err) {
    console.warn("[catalog] DB firm catalog failed; using bank", err);
    return listBankFirmCatalog();
  }
}

export async function getFirmBySlugOrId(
  slugOrId: string,
): Promise<FirmCatalogItem | null> {
  const catalog = await listFirmCatalog();
  return (
    catalog.items.find((firm) => firm.slug === slugOrId || firm.id === slugOrId) ??
    null
  );
}

type SignalRow = {
  occurrence_id: string;
  firm_id: string;
  firm_slug: string | null;
  role_raw: string | null;
  track: string | null;
  topic: string | null;
  round_raw: string | null;
  interview_date: string | null;
  source_question_wording: string | null;
  published_answer_id: string | null;
};

export async function getCompanySignals(options: {
  firmId: string;
  topic?: string | null;
  role?: string | null;
  limit?: number;
  offset?: number;
}): Promise<CompanySignalsResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const role = options.role?.trim() || null;

  if (!isDatabaseConfigured()) {
    try {
      const rows = await loadBankQuestions();
      const matches = rows.filter(
        (row) =>
          (`firm_${slugify(row.company ?? "")}` === options.firmId ||
            slugify(row.company ?? "") === options.firmId) &&
          (!role || row.position === role),
      );
      const items = matches.slice(offset, offset + limit).map((row) =>
        CompanySignalSchema.parse({
          occurrence_id: row.id,
          firm_id: options.firmId,
          firm_slug: slugify(row.company ?? ""),
          role: row.position ?? null,
          track: String(row.track ?? "") || null,
          topic: null,
          round: null,
          interview_date: row.date_posted || null,
          question: row.question,
          has_teaching_answer: false,
        }),
      );
      return {
        items,
        total: matches.length,
        limit,
        offset,
        source: items.length ? "bank_fallback" : "empty",
      };
    } catch (err) {
      console.warn("[catalog] bank signals failed", err);
      return { items: [], total: 0, limit, offset, source: "empty" };
    }
  }

  const sql = requireSql();
  const topic = options.topic?.trim() || null;
  const rows = (await sql`
    SELECT
      occurrence_id,
      firm_id,
      firm_slug,
      role_raw,
      track,
      topic,
      round_raw,
      interview_date::text,
      source_question_wording,
      published_answer_id
    FROM published.v_company_room_signals
    WHERE (firm_id = ${options.firmId} OR firm_slug = ${options.firmId})
      AND (${topic}::text IS NULL OR topic = ${topic})
      AND (${role}::text IS NULL OR role_raw = ${role})
      AND source_question_wording IS NOT NULL
    ORDER BY scraped_at DESC NULLS LAST, occurrence_id
    LIMIT ${limit} OFFSET ${offset}
  `) as SignalRow[];

  const countRows = (await sql`
    SELECT count(*)::int AS n
    FROM published.v_company_room_signals
    WHERE (firm_id = ${options.firmId} OR firm_slug = ${options.firmId})
      AND (${topic}::text IS NULL OR topic = ${topic})
      AND (${role}::text IS NULL OR role_raw = ${role})
      AND source_question_wording IS NOT NULL
  `) as Array<{ n: number }>;

  return {
    items: rows.map((row) =>
      CompanySignalSchema.parse({
        occurrence_id: row.occurrence_id,
        firm_id: row.firm_id,
        firm_slug: row.firm_slug,
        role: row.role_raw,
        track: row.track,
        topic: row.topic,
        round: row.round_raw,
        interview_date: row.interview_date,
        question: row.source_question_wording ?? "",
        has_teaching_answer: Boolean(row.published_answer_id),
      }),
    ),
    total: countRows[0]?.n ?? rows.length,
    limit,
    offset,
    source: rows.length ? "published" : "empty",
  };
}
