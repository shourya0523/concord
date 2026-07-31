/**
 * Prep profile (Mode A/B onboarding answers) — persisted in
 * app.user_profiles.preferences_json.profile.
 */
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { ensureAppUserQuery } from "./users";

export const PrepProfileSchema = z.object({
  modes: z.array(z.enum(["company_prep", "concept_learn"])).default([]),
  track: z.enum(["IB", "PE", "Both"]).nullable().default(null),
  role: z.string().nullable().default(null),
  interview_date: z.string().nullable().default(null),
  availability_minutes: z.number().int().positive().nullable().default(null),
  focus_prompt: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});
export type PrepProfile = z.infer<typeof PrepProfileSchema>;

export const PrepProfileResponseSchema = z.object({
  profile: PrepProfileSchema,
  source: z.enum(["published", "stub", "empty"]),
  note: z.string().optional(),
});
export type PrepProfileResponse = z.infer<typeof PrepProfileResponseSchema>;

const EMPTY_PROFILE: PrepProfile = PrepProfileSchema.parse({});

const stubProfiles = new Map<string, PrepProfile>();

export async function getPrepProfile(userId: string): Promise<PrepProfileResponse> {
  const stub = stubProfiles.get(userId);
  if (stub) return { profile: stub, source: "stub" };

  if (!isDatabaseConfigured()) {
    return { profile: EMPTY_PROFILE, source: "empty", note: "DATABASE_URL unset." };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT p.preferences_json
        FROM app.user_profiles p
        JOIN app.users u ON u.id = p.user_id
        WHERE u.neon_auth_user_id = ${userId}
        LIMIT 1
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      preferences_json: Record<string, unknown>;
    }>;
    const stored = rows[0]?.preferences_json?.profile;
    if (stored) {
      const parsed = PrepProfileSchema.safeParse(stored);
      if (parsed.success) return { profile: parsed.data, source: "published" };
    }
    return { profile: EMPTY_PROFILE, source: "empty", note: "No prep profile yet." };
  } catch (err) {
    console.warn("[profile] DB read failed", err);
    return { profile: EMPTY_PROFILE, source: "empty", note: "Profile read failed." };
  }
}

export async function putPrepProfile(options: {
  userId: string;
  email?: string | null;
  input: Omit<PrepProfile, "updated_at">;
}): Promise<PrepProfileResponse> {
  const { userId, email, input } = options;
  const profile = PrepProfileSchema.parse({
    ...input,
    updated_at: new Date().toISOString(),
  });

  if (!isDatabaseConfigured()) {
    stubProfiles.set(userId, profile);
    return { profile, source: "stub", note: "DATABASE_URL unset — saved in memory." };
  }

  try {
    const sql = requireSql();
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.user_profiles (user_id, preferences_json)
        VALUES (
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${JSON.stringify({ profile })}::jsonb
        )
        ON CONFLICT (user_id) DO UPDATE SET
          preferences_json = app.user_profiles.preferences_json ||
            jsonb_build_object('profile', ${JSON.stringify(profile)}::jsonb)
      `,
    ]);
    return { profile, source: "published" };
  } catch (err) {
    console.warn("[profile] DB write failed; saving in memory", err);
    stubProfiles.set(userId, profile);
    return { profile, source: "stub", note: "DB write failed — saved in memory." };
  }
}
