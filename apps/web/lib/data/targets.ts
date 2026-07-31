import { TargetCompanySetSchema, type TargetCompanySet } from "@ibpe/contracts";
import type {
  TargetCompanySetResponse,
  UpdateTargetCompanySetRequest,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";

const stubTargets = new Map<string, TargetCompanySet>();

/** Empty until the user picks firms — never fabricate a firm set (guardrail 15). */
function defaultTargetSet(userId: string): TargetCompanySet {
  return TargetCompanySetSchema.parse({
    user_id: userId,
    firm_ids: [],
    primary_firm_id: null,
    updated_at: new Date().toISOString(),
  });
}

function parseFirmIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function getTargetCompanySet(
  userId: string,
): Promise<TargetCompanySetResponse> {
  const stub = stubTargets.get(userId);
  if (stub) return { target_set: stub, source: "stub" };

  if (!isDatabaseConfigured()) {
    return {
      target_set: defaultTargetSet(userId),
      source: "stub",
      note: "DATABASE_URL unset — using default in-memory targets.",
    };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT t.firm_ids, t.primary_firm_id, t.updated_at
        FROM app.target_company_sets t
        JOIN app.users u ON u.id = t.user_id
        WHERE u.neon_auth_user_id = ${userId}
        LIMIT 1
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      firm_ids: unknown;
      primary_firm_id: string | null;
      updated_at: string;
    }>;
    const row = rows[0];
    if (row) {
      const firmIds = parseFirmIds(row.firm_ids);
      if (firmIds.length > 0) {
        return {
          target_set: TargetCompanySetSchema.parse({
            user_id: userId,
            firm_ids: firmIds,
            primary_firm_id: row.primary_firm_id,
            updated_at: new Date(row.updated_at).toISOString(),
          }),
          source: "published",
        };
      }
    }

    // Legacy preferences_json fallback
    const prefResults = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT preferences_json
        FROM app.user_profiles
        WHERE user_id = (
          SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1
        )
        LIMIT 1
      `,
    ]);
    const prefRows = (prefResults[0] ?? []) as Array<{
      preferences_json: Record<string, unknown>;
    }>;
    const stored = prefRows[0]?.preferences_json?.target_company_set;
    if (stored) {
      const parsed = TargetCompanySetSchema.safeParse(stored);
      if (parsed.success) return { target_set: parsed.data, source: "published" };
    }

    return {
      target_set: defaultTargetSet(userId),
      source: "stub",
      note: "No target-company set stored yet.",
    };
  } catch (err) {
    console.warn("[targets] DB read failed; using stub targets", err);
    return {
      target_set: defaultTargetSet(userId),
      source: "stub",
      note: "DB target read failed — using default targets.",
    };
  }
}

export async function putTargetCompanySet(options: {
  userId: string;
  email?: string | null;
  input: UpdateTargetCompanySetRequest;
}): Promise<TargetCompanySetResponse> {
  const { userId, input, email } = options;
  const targetSet = TargetCompanySetSchema.parse({
    user_id: userId,
    firm_ids: input.firm_ids,
    primary_firm_id: input.primary_firm_id ?? input.firm_ids[0] ?? null,
    updated_at: new Date().toISOString(),
  });

  if (!isDatabaseConfigured()) {
    stubTargets.set(userId, targetSet);
    return {
      target_set: targetSet,
      source: "stub",
      note: "DATABASE_URL unset — saved targets in memory.",
    };
  }

  try {
    const sql = requireSql();
    // primary_firm_id has FK to canonical.firms — null it if firm row missing
    const firmCheck = (await sql`
      SELECT id FROM canonical.firms WHERE id = ${targetSet.primary_firm_id} LIMIT 1
    `) as Array<{ id: string }>;
    const primaryFirmId = firmCheck[0]?.id ?? null;

    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.target_company_sets (user_id, firm_ids, primary_firm_id, updated_at)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${JSON.stringify(targetSet.firm_ids)}::jsonb,
          ${primaryFirmId},
          now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          firm_ids = EXCLUDED.firm_ids,
          primary_firm_id = EXCLUDED.primary_firm_id,
          updated_at = now()
      `,
      s`
        INSERT INTO app.user_profiles (user_id, preferences_json)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${JSON.stringify({ target_company_set: targetSet })}::jsonb
        )
        ON CONFLICT (user_id) DO UPDATE SET
          preferences_json = app.user_profiles.preferences_json ||
            jsonb_build_object('target_company_set', ${JSON.stringify(targetSet)}::jsonb)
      `,
    ]);
    return {
      target_set: {
        ...targetSet,
        primary_firm_id: primaryFirmId ?? targetSet.primary_firm_id,
      },
      source: "published",
    };
  } catch (err) {
    console.warn("[targets] DB write failed; storing targets in memory", err);
    stubTargets.set(userId, targetSet);
    return {
      target_set: targetSet,
      source: "stub",
      note: "DB target write failed — saved targets in memory.",
    };
  }
}
