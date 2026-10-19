/**
 * Prep profile (Mode A/B onboarding answers) — persisted in
 * app.user_profiles.preferences_json.profile.
 */
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { isValidTimeZone } from "@/lib/local-day";
import { ensureAppUserQuery } from "./users";
import { memoryStore } from "./memory-store";

export const PrepProfileSchema = z.object({
  modes: z.array(z.enum(["company_prep", "concept_learn"])).default([]),
  track: z.enum(["IB", "PE", "Both"]).nullable().default(null),
  role: z.string().nullable().default(null),
  interview_date: z.string().nullable().default(null),
  availability_minutes: z.number().int().positive().nullable().default(null),
  focus_prompt: z.string().nullable().default(null),
  /** IANA timezone (streaks, daily set and reminders use the local day). */
  timezone: z.string().nullable().default(null),
  /** Local hour 0–23 for the daily reminder; null = no reminder. */
  reminder_hour: z.number().int().min(0).max(23).nullable().default(null),
  notify_email: z.boolean().default(true),
  notify_push: z.boolean().default(false),
  weekly_recap: z.boolean().default(true),
  /** Opt-in weekly XP league. */
  league_opt_in: z.boolean().default(false),
  /** Placement check finished or skipped (ISO time). */
  placement_completed_at: z.string().nullable().default(null),
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

/**
 * PUT /api/profile body: every field optional. Omitted keys keep their stored
 * value (a settings save that predates a new field must not wipe it); an
 * explicit `null` clears a nullable field.
 */
export const PrepProfilePatchSchema = PrepProfileSchema.omit({ updated_at: true }).partial();
export type PrepProfilePatch = z.infer<typeof PrepProfilePatchSchema>;

/** Only the keys the caller actually sent (undefined = "not supplied"). */
export function definedPatch(patch: PrepProfilePatch): PrepProfilePatch {
  const out = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as PrepProfilePatch;
  // Unknown IANA zones are dropped rather than stored (streaks fall back to UTC).
  if (typeof out.timezone === "string" && !isValidTimeZone(out.timezone)) out.timezone = null;
  return out;
}

/** Merge a partial update onto the stored profile; result is fully validated. */
export function mergePrepProfile(
  existing: PrepProfile | null | undefined,
  patch: PrepProfilePatch,
  now: Date = new Date(),
): PrepProfile {
  return PrepProfileSchema.parse({
    ...(existing ?? EMPTY_PROFILE),
    ...definedPatch(patch),
    updated_at: now.toISOString(),
  });
}

const stubProfiles = memoryStore<string, PrepProfile>("profiles");

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

/**
 * Save a (partial) prep profile. Supplied keys are merged onto the stored
 * profile — in the DB via jsonb `||`, so concurrent saves of different fields
 * do not clobber each other.
 */
export async function putPrepProfile(options: {
  userId: string;
  email?: string | null;
  input: PrepProfilePatch;
}): Promise<PrepProfileResponse> {
  const { userId, email } = options;
  const now = new Date();
  const patch = definedPatch(options.input);

  if (!isDatabaseConfigured()) {
    const profile = mergePrepProfile(stubProfiles.get(userId), patch, now);
    stubProfiles.set(userId, profile);
    return { profile, source: "stub", note: "DATABASE_URL unset — saved in memory." };
  }

  const current = await getPrepProfile(userId);
  const profile = mergePrepProfile(
    current.source === "published" ? current.profile : stubProfiles.get(userId),
    patch,
    now,
  );
  const patchJson = JSON.stringify({ ...patch, updated_at: profile.updated_at });

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
            jsonb_build_object(
              'profile',
              CASE
                WHEN jsonb_typeof(app.user_profiles.preferences_json -> 'profile') = 'object'
                  THEN (app.user_profiles.preferences_json -> 'profile') || ${patchJson}::jsonb
                ELSE ${JSON.stringify(profile)}::jsonb
              END
            )
      `,
    ]);
    return { profile, source: "published" };
  } catch (err) {
    console.warn("[profile] DB write failed; saving in memory", err);
    stubProfiles.set(userId, profile);
    return { profile, source: "stub", note: "DB write failed — saved in memory." };
  }
}
