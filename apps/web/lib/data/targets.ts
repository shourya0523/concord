import { TargetCompanySetSchema, type TargetCompanySet } from "@ibpe/contracts";
import type {
  TargetCompanySetResponse,
  UpdateTargetCompanySetRequest,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { DEFAULT_TARGET_IDS } from "@/lib/mock-data";
import { ensureAppUserQuery } from "./users";

const stubTargets = new Map<string, TargetCompanySet>();

function defaultTargetSet(userId: string): TargetCompanySet {
  return TargetCompanySetSchema.parse({
    user_id: userId,
    firm_ids: DEFAULT_TARGET_IDS,
    primary_firm_id: DEFAULT_TARGET_IDS[0] ?? null,
    updated_at: new Date().toISOString(),
  });
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
        SELECT preferences_json, user_id
        FROM app.user_profiles
        WHERE user_id = (
          SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1
        )
        LIMIT 1
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      user_id: string;
      preferences_json: Record<string, unknown>;
    }>;
    const stored = rows[0]?.preferences_json?.target_company_set;
    if (stored) {
      const parsed = TargetCompanySetSchema.safeParse(stored);
      if (parsed.success) return { target_set: parsed.data, source: "published" };
    }
    return {
      target_set: defaultTargetSet(userId),
      source: "stub",
      note: "No target-company preference stored yet.",
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
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
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
    return { target_set: targetSet, source: "published" };
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
