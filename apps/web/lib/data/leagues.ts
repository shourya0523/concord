/**
 * Opt-in weekly XP leagues (plan 2026-09-23-001 P7.3), behind the `leagues`
 * flag.
 *
 * - A league week starts Monday in the member's local timezone
 *   (`week_start`). Weekly XP = Σ app.daily_activity.xp for that week.
 * - Members are grouped into leagues of ≤ 30 by cohort: the optional
 *   free-text cohort ("2027 SA") when set, else the prep track.
 * - Each member gets an anonymised handle (adjective-animal-###) derived from
 *   a hash — never an email or a name. User ids never leave the server.
 * - League tables have four tiers (migration 063): Boutique → Middle Market →
 *   Bulge Bracket → Elite Boutique. A week's top 20% move up a tier and the
 *   bottom 20% (5+ members) move down when the week is settled — lazily by
 *   the member on their next visit, and by the daily cron. Without 063 the
 *   app runs tierless (everyone plays tier 0, nothing settles).
 *
 * Reads/writes run under RLS (`withRlsUserId`): a member may write only
 * their own row and read rows of leagues they belong to (migration 046).
 * League sizes for placement come from `app.league_sizes` (057, security
 * definer, counts only). The cron refreshes everyone's XP on the owner
 * connection (`refreshLeagueXp`).
 */
import { createHash } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { z } from "zod";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { patchPrepProfile } from "@/lib/notify/profile-patch";
import { addDays, localParts, mondayOf, toIsoDate } from "@/lib/notify/time";
import { memoryStore } from "./memory-store";
import { getPrepProfile, type PrepProfile } from "./profile";
import { ensureAppUserQuery } from "./users";

type SqlClient = NeonQueryFunction<false, false>;
type SqlQuery = ReturnType<SqlClient>;

export const LEAGUE_CAP = 30;
export const COHORT_MAX_LENGTH = 40;

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

export const HANDLE_ADJECTIVES = [
  "amber", "bold", "brisk", "calm", "clever", "cobalt", "crisp", "dapper",
  "eager", "fleet", "gentle", "golden", "hardy", "jolly", "keen", "lucky",
  "mellow", "nimble", "plucky", "quiet", "rapid", "rosy", "sage", "silver",
  "steady", "sunny", "swift", "tidy", "true", "vivid", "witty", "zesty",
] as const;

export const HANDLE_ANIMALS = [
  "badger", "bison", "crane", "dolphin", "falcon", "fox", "gecko", "heron",
  "ibex", "jaguar", "koala", "lemur", "lynx", "marten", "moose", "narwhal",
  "ocelot", "otter", "owl", "panda", "puffin", "quokka", "raven", "seal",
  "sparrow", "stoat", "tapir", "tiger", "walrus", "wombat", "yak", "zebra",
] as const;

export const HANDLE_PATTERN = /^[a-z]+-[a-z]+-\d{3}$/;

/** Deterministic anonymised handle for a seed (adjective-animal-###). */
export function handleFromSeed(seed: string): string {
  const digest = createHash("sha256").update(`concord-league-handle:${seed}`).digest();
  const adjective = HANDLE_ADJECTIVES[digest[0]! % HANDLE_ADJECTIVES.length];
  const animal = HANDLE_ANIMALS[digest[1]! % HANDLE_ANIMALS.length];
  const number = 100 + (digest.readUInt16BE(2) % 900);
  return `${adjective}-${animal}-${number}`;
}

/** Handles rotate weekly so standings cannot be linked across weeks. */
export function leagueHandle(userId: string, weekStart: string, attempt = 0): string {
  return handleFromSeed(`${userId}:${weekStart}${attempt ? `:${attempt}` : ""}`);
}

/* ------------------------------------------------------------------ */
/* Cohorts + grouping                                                  */
/* ------------------------------------------------------------------ */

/** Tidy free-text cohort input; null when empty. */
export function normaliseCohort(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} '&./()-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COHORT_MAX_LENGTH)
    .trim();
  return cleaned || null;
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "x"
  );
}

export type CohortKey = { key: string; label: string };

/** Group by cohort when given (case/spacing-insensitive), else by track. */
export function cohortKeyFor(
  cohort: string | null | undefined,
  track: PrepProfile["track"] | null | undefined,
): CohortKey {
  const normalised = normaliseCohort(cohort);
  if (normalised) return { key: `cohort-${slug(normalised)}`, label: normalised };
  const trackSlug = track ? track.toLowerCase() : "all";
  return {
    key: `track-${trackSlug}`,
    label: track === "Both" ? "IB + PE track" : track ? `${track} track` : "All tracks",
  };
}

export function leagueId(weekStart: string, key: string, index: number): string {
  return `lg:${weekStart}:${key}:${index}`;
}

export function leaguePrefix(weekStart: string, key: string): string {
  return `lg:${weekStart}:${key}:`;
}

export function leagueIndex(id: string): number {
  const match = /:(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

export type LeagueSize = { league_id: string; members: number };

/**
 * Place a new member: fill the lowest-numbered league with room, else open
 * the next one. Keeps leagues ≤ cap.
 */
export function pickLeague(
  sizes: LeagueSize[],
  weekStart: string,
  key: string,
  cap = LEAGUE_CAP,
): string {
  const prefix = leaguePrefix(weekStart, key);
  const ours = sizes
    .filter((s) => s.league_id.startsWith(prefix))
    .sort((a, b) => leagueIndex(a.league_id) - leagueIndex(b.league_id));
  const open = ours.find((s) => s.members < cap);
  if (open) return open.league_id;
  const next = ours.length === 0 ? 1 : Math.max(...ours.map((s) => leagueIndex(s.league_id))) + 1;
  return leagueId(weekStart, key, next);
}

/** Batch grouping (same rule as sequential joins) — league id → user ids. */
export function groupIntoLeagues(
  members: Array<{ userId: string; cohortKey: string }>,
  weekStart: string,
  cap = LEAGUE_CAP,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const sorted = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
  for (const member of sorted) {
    const sizes = [...groups.entries()].map(([id, ids]) => ({ league_id: id, members: ids.length }));
    const id = pickLeague(sizes, weekStart, member.cohortKey, cap);
    groups.set(id, [...(groups.get(id) ?? []), member.userId]);
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Weeks, standings, promotion copy                                     */
/* ------------------------------------------------------------------ */

export function leagueWeek(now: Date, timeZone: string | null | undefined) {
  const local = localParts(now, timeZone);
  const weekStart = mondayOf(local.localDate);
  return { weekStart, weekEnd: addDays(weekStart, 6), today: local.localDate, timeZone: local.timeZone };
}

export type LeagueZone = "promotion" | "safe" | "demotion";

export function zoneCounts(size: number): { promote: number; demote: number } {
  if (size < 3) return { promote: size >= 2 ? 1 : 0, demote: 0 };
  const promote = Math.max(1, Math.floor(size * 0.2));
  const demote = size >= 5 ? Math.max(1, Math.floor(size * 0.2)) : 0;
  return { promote, demote };
}

export function zoneFor(rank: number, size: number): LeagueZone {
  const { promote, demote } = zoneCounts(size);
  if (rank <= promote) return "promotion";
  if (demote > 0 && rank > size - demote) return "demotion";
  return "safe";
}

export type StandingInput = { handle: string; xp: number; isYou: boolean };
export type Standing = { rank: number; handle: string; xp: number; is_you: boolean; zone: LeagueZone };

/** XP desc, handle asc; ties share a rank (1, 2, 2, 4). */
export function rankStandings(rows: StandingInput[]): Standing[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp || a.handle.localeCompare(b.handle));
  const size = sorted.length;
  let rank = 0;
  let previousXp: number | null = null;
  return sorted.map((row, index) => {
    if (previousXp === null || row.xp !== previousXp) rank = index + 1;
    previousXp = row.xp;
    return { rank, handle: row.handle, xp: row.xp, is_you: row.isYou, zone: zoneFor(rank, size) };
  });
}

export function promotionCopy(you: Standing | null, size: number, daysLeft: number, tier?: number): string {
  if (!you) return "Join to see where you land this week.";
  const days = daysLeft <= 0 ? "Final day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  if (size <= 1) return `${days}. You're the first in your league — others join as they opt in.`;
  const { promote } = zoneCounts(size);
  if (you.zone === "promotion") {
    const where = promote === 1 ? "top of the league" : `in the top ${promote}`;
    if (tier === undefined) return `${days}. You're ${where} — on track to move up a division next week.`;
    if (clampTier(tier) >= TOP_TIER) return `${days}. You're ${where} of the top table — hold it to stay there.`;
    return `${days}. You're ${where} — on track for ${tierName(clampTier(tier) + 1)} next week.`;
  }
  if (you.zone === "demotion") {
    if (tier !== undefined && clampTier(tier) > 0) {
      return `${days}. You're in the bottom group — a daily set or two keeps you out of ${tierName(clampTier(tier) - 1)}.`;
    }
    return `${days}. You're in the bottom group — finish a daily set or two to climb out.`;
  }
  const who = promote === 1 ? "The leader moves" : `The top ${promote} move`;
  return `${days}. ${who} up next week; a couple of daily sets can get you there.`;
}

/* ------------------------------------------------------------------ */
/* Tiers + settlement (pure)                                            */
/* ------------------------------------------------------------------ */

export const LEAGUE_TIERS = ["Boutique", "Middle Market", "Bulge Bracket", "Elite Boutique"] as const;
export const TOP_TIER = LEAGUE_TIERS.length - 1;
export type LeagueResult = "promoted" | "held" | "demoted";

export function clampTier(tier: number | null | undefined): number {
  const n = Math.floor(Number(tier ?? 0));
  return Number.isFinite(n) ? Math.min(TOP_TIER, Math.max(0, n)) : 0;
}

export function tierName(tier: number | null | undefined): string {
  return LEAGUE_TIERS[clampTier(tier)] as string;
}

/** Final outcome for a settled week: zone → result, clamped at both ends. */
export function settleOutcome(rank: number, size: number, tier: number): { result: LeagueResult; next_tier: number } {
  const current = clampTier(tier);
  const zone = zoneFor(rank, size);
  if (zone === "promotion" && current < TOP_TIER) return { result: "promoted", next_tier: current + 1 };
  if (zone === "demotion" && current > 0) return { result: "demoted", next_tier: current - 1 };
  return { result: "held", next_tier: current };
}

export function nextTierAfter(tier: number, result: LeagueResult | null | undefined): number {
  const current = clampTier(tier);
  if (result === "promoted") return Math.min(TOP_TIER, current + 1);
  if (result === "demoted") return Math.max(0, current - 1);
  return current;
}

/**
 * Members only meet others in their tier. Tier 0 keeps the pre-tier key so
 * leagues already running when 063 lands aren't split mid-week.
 */
export function tierCohortKey(tier: number, cohortKey: string): string {
  const t = clampTier(tier);
  return t === 0 ? cohortKey : `t${t}-${cohortKey}`;
}

/** Postgres "undefined column" — migration 063 not applied yet. */
export function isMissingColumn(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42703" || /column .* does not exist/i.test(String((err as Error | null)?.message ?? ""));
}

/* ------------------------------------------------------------------ */
/* API contract                                                        */
/* ------------------------------------------------------------------ */

const StandingSchema = z.object({
  rank: z.number().int().positive(),
  handle: z.string().regex(HANDLE_PATTERN),
  xp: z.number().int().nonnegative(),
  is_you: z.boolean(),
  zone: z.enum(["promotion", "safe", "demotion"]),
});

export const LeagueResponseSchema = z.object({
  opted_in: z.boolean(),
  week_start: z.string(),
  week_end: z.string(),
  time_zone: z.string(),
  cohort: z.string().nullable(),
  cohort_label: z.string(),
  you: StandingSchema.nullable(),
  standings: z.array(StandingSchema),
  size: z.number().int().nonnegative(),
  cap: z.number().int().positive(),
  copy: z.string(),
  source: z.enum(["published", "stub", "empty"]),
  note: z.string().optional(),
  /** This week's tier (league tables). */
  tier: z.object({ index: z.number().int().min(0).max(3), name: z.string() }).optional(),
  tiers: z.array(z.string()).optional(),
  /** The previous week you played, once settled — drives the weekly result. */
  last_week: z
    .object({
      week_start: z.string(),
      tier: z.number().int().min(0).max(3),
      tier_name: z.string(),
      result: z.enum(["promoted", "held", "demoted"]),
      next_tier: z.number().int().min(0).max(3),
      next_tier_name: z.string(),
      rank: z.number().int().positive(),
      size: z.number().int().positive(),
      standings: z.array(StandingSchema),
    })
    .nullable()
    .optional(),
});
export type LeagueResponse = z.infer<typeof LeagueResponseSchema>;
export type LeagueLastWeek = NonNullable<LeagueResponse["last_week"]>;

export const JoinLeagueRequestSchema = z.object({
  cohort: z.string().max(80).nullable().optional(),
});

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

type MembershipRow = {
  league_id: string;
  handle: string;
  cohort: string | null;
  xp: number;
  tier?: number | null;
  week_start?: string;
};

type PrevRow = {
  week_start: string;
  league_id: string;
  cohort: string | null;
  tier: number | null;
  final_rank: number | null;
  league_size: number | null;
  result: LeagueResult | null;
};

type StubMember = {
  userId: string;
  weekStart: string;
  leagueId: string;
  handle: string;
  cohort: string | null;
  xp: number;
  tier: number;
  finalRank?: number;
  leagueSize?: number;
  result?: LeagueResult;
};
const stubMembers = memoryStore<string, StubMember>("league_memberships");

/** Test seam: put a member straight into the in-memory store. */
export function seedStubLeagueMember(member: StubMember): void {
  stubMembers.set(`${member.userId}:${member.weekStart}`, member);
}

function buildResponse(options: {
  optedIn: boolean;
  week: ReturnType<typeof leagueWeek>;
  cohort: string | null;
  track: PrepProfile["track"];
  rows: StandingInput[];
  source: LeagueResponse["source"];
  note?: string;
  tier?: number | null;
  lastWeek?: LeagueLastWeek | null;
}): LeagueResponse {
  const standings = options.optedIn ? rankStandings(options.rows) : [];
  const you = standings.find((s) => s.is_you) ?? null;
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(options.week.weekEnd) - Date.parse(options.week.today)) / 86_400_000),
  );
  const tiered = options.tier != null;
  return {
    opted_in: options.optedIn,
    week_start: options.week.weekStart,
    week_end: options.week.weekEnd,
    time_zone: options.week.timeZone,
    cohort: options.cohort,
    cohort_label: cohortKeyFor(options.cohort, options.track).label,
    you,
    standings,
    size: standings.length,
    cap: LEAGUE_CAP,
    copy: options.optedIn
      ? promotionCopy(you, standings.length, daysLeft, tiered ? clampTier(options.tier) : undefined)
      : "Leagues are opt-in. You appear only as an anonymous handle — never your name or email.",
    source: options.source,
    ...(options.note ? { note: options.note } : {}),
    ...(tiered
      ? {
          tier: { index: clampTier(options.tier), name: tierName(options.tier) },
          tiers: [...LEAGUE_TIERS],
          last_week: options.lastWeek ?? null,
        }
      : {}),
  };
}

/** Rank a finished week and describe the result for `isYou`. */
export function lastWeekSummary(options: {
  weekStart: string;
  tier: number;
  rows: StandingInput[];
  settled?: { rank: number | null; size: number | null; result: LeagueResult | null } | null;
}): LeagueLastWeek | null {
  const standings = rankStandings(options.rows);
  const you = standings.find((s) => s.is_you);
  if (!you) return null;
  const rank = options.settled?.rank ?? you.rank;
  const size = options.settled?.size ?? standings.length;
  const outcome = options.settled?.result
    ? { result: options.settled.result, next_tier: nextTierAfter(options.tier, options.settled.result) }
    : settleOutcome(rank, size, options.tier);
  return {
    week_start: options.weekStart,
    tier: clampTier(options.tier),
    tier_name: tierName(options.tier),
    result: outcome.result,
    next_tier: outcome.next_tier,
    next_tier_name: tierName(outcome.next_tier),
    rank,
    size,
    standings,
  };
}

function stubLeague(userId: string, profile: PrepProfile, now: Date, cohortInput?: string | null): LeagueResponse {
  const week = leagueWeek(now, profile.timezone);
  const key = `${userId}:${week.weekStart}`;
  if (!profile.league_opt_in) {
    stubMembers.delete(key);
    return buildResponse({ optedIn: false, week, cohort: null, track: profile.track, rows: [], source: "stub" });
  }

  // Settle the last week this member played (lazily, once).
  const prev = [...stubMembers.values()]
    .filter((m) => m.userId === userId && m.weekStart < week.weekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  let lastWeek: LeagueLastWeek | null = null;
  if (prev) {
    const rows = [...stubMembers.values()]
      .filter((m) => m.leagueId === prev.leagueId && m.weekStart === prev.weekStart)
      .map((m) => ({ handle: m.handle, xp: m.xp, isYou: m.userId === userId }));
    lastWeek = lastWeekSummary({
      weekStart: prev.weekStart,
      tier: prev.tier,
      rows,
      settled: prev.result ? { rank: prev.finalRank ?? null, size: prev.leagueSize ?? null, result: prev.result } : null,
    });
    if (lastWeek && !prev.result) {
      prev.result = lastWeek.result;
      prev.finalRank = lastWeek.rank;
      prev.leagueSize = lastWeek.size;
    }
  }

  let member = stubMembers.get(key);
  const cohort =
    cohortInput !== undefined ? normaliseCohort(cohortInput) : (member?.cohort ?? prev?.cohort ?? null);
  if (!member) {
    const tier = prev ? nextTierAfter(prev.tier, prev.result) : 0;
    const cohortKey = tierCohortKey(tier, cohortKeyFor(cohort, profile.track).key);
    const sizes = new Map<string, number>();
    for (const m of stubMembers.values()) {
      if (m.weekStart === week.weekStart) sizes.set(m.leagueId, (sizes.get(m.leagueId) ?? 0) + 1);
    }
    const leagueIdValue = pickLeague(
      [...sizes].map(([league_id, members]) => ({ league_id, members })),
      week.weekStart,
      cohortKey,
    );
    member = {
      userId,
      weekStart: week.weekStart,
      leagueId: leagueIdValue,
      handle: leagueHandle(userId, week.weekStart),
      cohort,
      xp: 0,
      tier,
    };
    stubMembers.set(key, member);
  } else if (cohortInput !== undefined) {
    member.cohort = cohort;
  }
  const rows = [...stubMembers.values()]
    .filter((m) => m.leagueId === member.leagueId && m.weekStart === week.weekStart)
    .map((m) => ({ handle: m.handle, xp: m.xp, isYou: m.userId === userId }));
  return buildResponse({
    optedIn: true,
    week,
    cohort: member.cohort,
    track: profile.track,
    rows,
    source: "stub",
    note: "DATABASE_URL unset — league kept in memory.",
    tier: member.tier,
    lastWeek,
  });
}

/** Set once a query shows migration 063 is missing; avoids a failing round trip per view. */
let tierColumnsMissing = false;

/**
 * Current week's league for the user. When opted in and not yet placed this
 * week, joins (carrying the latest cohort forward) in the tier last week's
 * result implies, settling that week first if nobody has yet. When opted
 * out, removes this week's row so the user drops out of everyone's standings.
 * `cohortInput` (from an explicit join) sets the cohort; undefined keeps it.
 */
export async function getCurrentLeague(options: {
  userId: string;
  email?: string | null;
  now?: Date;
  cohortInput?: string | null;
}): Promise<LeagueResponse> {
  const { userId, cohortInput } = options;
  const now = options.now ?? new Date();
  const { profile } = await getPrepProfile(userId);

  if (!isDatabaseConfigured()) return stubLeague(userId, profile, now, cohortInput);

  const week = leagueWeek(now, profile.timezone);
  const sql = requireSql();

  if (!profile.league_opt_in) {
    await withRlsUserId(sql, userId, (s) => [
      s`
        DELETE FROM app.league_memberships
        WHERE week_start = ${week.weekStart}::date
          AND user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
      `,
    ]);
    return buildResponse({ optedIn: false, week, cohort: null, track: profile.track, rows: [], source: "published" });
  }

  if (!tierColumnsMissing) {
    try {
      return await dbLeague({ ...options, now, profile, week, sql, tiers: true });
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
      tierColumnsMissing = true;
      console.warn("[leagues] migration 063 not applied — running without tiers");
    }
  }
  return dbLeague({ ...options, now, profile, week, sql, tiers: false });
}

async function dbLeague(options: {
  userId: string;
  email?: string | null;
  cohortInput?: string | null;
  now: Date;
  profile: PrepProfile;
  week: ReturnType<typeof leagueWeek>;
  sql: SqlClient;
  tiers: boolean;
}): Promise<LeagueResponse> {
  const { userId, email, cohortInput, profile, week, sql, tiers } = options;

  // 1. Own row this week + the latest earlier week (cohort carry-forward, tier).
  const [ownRows, prevRows] = (await withRlsUserId(sql, userId, (s) =>
    tiers
      ? [
          s`
            SELECT m.league_id, m.handle, m.cohort, m.xp, m.tier
            FROM app.league_memberships m
            JOIN app.users u ON u.id = m.user_id
            WHERE u.neon_auth_user_id = ${userId} AND m.week_start = ${week.weekStart}::date
            LIMIT 1
          `,
          s`
            SELECT m.week_start::text AS week_start, m.league_id, m.cohort, m.tier,
                   m.final_rank, m.league_size, m.result
            FROM app.league_memberships m
            JOIN app.users u ON u.id = m.user_id
            WHERE u.neon_auth_user_id = ${userId} AND m.week_start < ${week.weekStart}::date
            ORDER BY m.week_start DESC
            LIMIT 1
          `,
        ]
      : [
          s`
            SELECT m.league_id, m.handle, m.cohort, m.xp
            FROM app.league_memberships m
            JOIN app.users u ON u.id = m.user_id
            WHERE u.neon_auth_user_id = ${userId} AND m.week_start = ${week.weekStart}::date
            LIMIT 1
          `,
          s`
            SELECT m.week_start::text AS week_start, m.league_id, m.cohort
            FROM app.league_memberships m
            JOIN app.users u ON u.id = m.user_id
            WHERE u.neon_auth_user_id = ${userId}
            ORDER BY m.week_start DESC
            LIMIT 1
          `,
        ],
  )) as [MembershipRow[], PrevRow[]];

  let membership = ownRows[0] ?? null;
  const prev = prevRows[0] ?? null;
  const cohort =
    cohortInput !== undefined ? normaliseCohort(cohortInput) : (membership?.cohort ?? prev?.cohort ?? null);

  // 2. Settle the previous week for this member if nobody has yet (own row only).
  let lastWeek: LeagueLastWeek | null = null;
  if (tiers && prev && prev.week_start < week.weekStart) {
    const prevTier = clampTier(prev.tier);
    const [, prevStandings] = (await withRlsUserId(sql, userId, (s) => [
      s`
        UPDATE app.league_memberships m
        SET xp = coalesce((
              SELECT sum(a.xp)::int FROM app.daily_activity a
              WHERE a.user_id = m.user_id
                AND a.local_date BETWEEN m.week_start AND m.week_start + 6
            ), 0),
            updated_at = now()
        WHERE m.week_start = ${prev.week_start}::date AND m.settled_at IS NULL
          AND m.user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
      `,
      s`
        SELECT m.handle, m.xp, (u.neon_auth_user_id = ${userId}) AS is_you
        FROM app.league_memberships m
        LEFT JOIN app.users u ON u.id = m.user_id
        WHERE m.league_id = ${prev.league_id} AND m.week_start = ${prev.week_start}::date
        ORDER BY m.xp DESC, m.handle
        LIMIT ${LEAGUE_CAP * 2}
      `,
    ])) as [unknown, Array<{ handle: string; xp: number; is_you: boolean | null }>];
    lastWeek = lastWeekSummary({
      weekStart: prev.week_start,
      tier: prevTier,
      rows: prevStandings.map((r) => ({ handle: r.handle, xp: Number(r.xp), isYou: Boolean(r.is_you) })),
      settled: prev.result
        ? { rank: prev.final_rank, size: prev.league_size, result: prev.result }
        : null,
    });
    if (lastWeek && !prev.result) {
      const settled = lastWeek;
      await withRlsUserId(sql, userId, (s) => [
        s`
          UPDATE app.league_memberships
          SET final_rank = ${settled.rank}, league_size = ${settled.size},
              result = ${settled.result}, settled_at = now(), updated_at = now()
          WHERE week_start = ${prev.week_start}::date AND settled_at IS NULL
            AND user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
        `,
      ]);
    }
  }

  // 3. Join if needed (placement from definer counts), refresh own XP, read standings.
  const tier = tiers
    ? membership?.tier != null
      ? clampTier(membership.tier)
      : lastWeek
        ? lastWeek.next_tier
        : prev
          ? nextTierAfter(clampTier(prev.tier), prev.result)
          : 0
    : null;
  let joinQueries: (s: SqlClient) => SqlQuery[] = () => [];
  if (!membership) {
    const { key } = cohortKeyFor(cohort, profile.track);
    const placementKey = tiers ? tierCohortKey(tier ?? 0, key) : key;
    const sizes = (await sql`
      SELECT league_id, members FROM app.league_sizes(${week.weekStart}::date, ${leaguePrefix(week.weekStart, placementKey)})
    `) as LeagueSize[];
    const id = pickLeague(
      sizes.map((s) => ({ league_id: s.league_id, members: Number(s.members) })),
      week.weekStart,
      placementKey,
    );
    membership = { league_id: id, handle: leagueHandle(userId, week.weekStart), cohort, xp: 0 };
    const placed = membership;
    joinQueries = (s) => [
      ensureAppUserQuery(s, userId, email),
      tiers
        ? s`
            INSERT INTO app.league_memberships (user_id, week_start, league_id, handle, cohort, xp, tier)
            VALUES (
              (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
              ${week.weekStart}::date, ${placed.league_id}, ${placed.handle}, ${placed.cohort}, 0, ${tier ?? 0}
            )
            ON CONFLICT (user_id, week_start) DO NOTHING
          `
        : s`
            INSERT INTO app.league_memberships (user_id, week_start, league_id, handle, cohort, xp)
            VALUES (
              (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
              ${week.weekStart}::date, ${placed.league_id}, ${placed.handle}, ${placed.cohort}, 0
            )
            ON CONFLICT (user_id, week_start) DO NOTHING
          `,
    ];
  } else if (cohortInput !== undefined && cohort !== membership.cohort) {
    // Cohort edits apply to placement from next week; store it now.
    joinQueries = (s) => [
      s`
        UPDATE app.league_memberships SET cohort = ${cohort}, updated_at = now()
        WHERE week_start = ${week.weekStart}::date
          AND user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
      `,
    ];
  }

  const results = await withRlsUserId(sql, userId, (s) => [
    ...joinQueries(s),
    s`
      UPDATE app.league_memberships m
      SET xp = coalesce((
            SELECT sum(a.xp)::int FROM app.daily_activity a
            WHERE a.user_id = m.user_id
              AND a.local_date BETWEEN m.week_start AND m.week_start + 6
          ), 0),
          updated_at = now()
      WHERE m.week_start = ${week.weekStart}::date
        AND m.user_id = (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1)
    `,
    s`
      SELECT m.handle, m.xp, m.cohort, (u.neon_auth_user_id = ${userId}) AS is_you
      FROM app.league_memberships m
      JOIN app.league_memberships mine
        ON mine.league_id = m.league_id AND mine.week_start = m.week_start
      JOIN app.users me ON me.id = mine.user_id AND me.neon_auth_user_id = ${userId}
      LEFT JOIN app.users u ON u.id = m.user_id
      WHERE m.week_start = ${week.weekStart}::date
      ORDER BY m.xp DESC, m.handle
      LIMIT ${LEAGUE_CAP * 2}
    `,
  ]);
  const standingRows = (results[results.length - 1] ?? []) as Array<{
    handle: string;
    xp: number;
    cohort: string | null;
    is_you: boolean | null;
  }>;
  const mine = standingRows.find((r) => r.is_you);
  return buildResponse({
    optedIn: true,
    week,
    cohort: mine ? mine.cohort : cohort,
    track: profile.track,
    rows: standingRows.map((r) => ({ handle: r.handle, xp: Number(r.xp), isYou: Boolean(r.is_you) })),
    source: "published",
    tier,
    lastWeek,
  });
}

/** Opt in (and join this week) or opt out, saving `league_opt_in` on the profile. */
export async function setLeagueOptIn(options: {
  userId: string;
  email?: string | null;
  optIn: boolean;
  cohort?: string | null;
  now?: Date;
}): Promise<LeagueResponse> {
  await patchPrepProfile({
    userId: options.userId,
    email: options.email,
    patch: { league_opt_in: options.optIn },
  });
  return getCurrentLeague({
    userId: options.userId,
    email: options.email,
    now: options.now,
    cohortInput: options.optIn ? options.cohort : undefined,
  });
}

/**
 * Cron (owner connection, no RLS GUC): recompute weekly XP for every
 * membership in the last two weeks. Returns rows changed.
 */
export async function refreshLeagueXp(sql: SqlClient, now: Date = new Date()): Promise<number> {
  const since = addDays(toIsoDate(now) ?? now.toISOString().slice(0, 10), -14);
  const rows = (await sql`
    UPDATE app.league_memberships m
    SET xp = x.xp, updated_at = now()
    FROM (
      SELECT m2.user_id, m2.week_start,
             coalesce((
               SELECT sum(a.xp)::int FROM app.daily_activity a
               WHERE a.user_id = m2.user_id
                 AND a.local_date BETWEEN m2.week_start AND m2.week_start + 6
             ), 0) AS xp
      FROM app.league_memberships m2
      WHERE m2.week_start >= ${since}::date
    ) x
    WHERE m.user_id = x.user_id AND m.week_start = x.week_start AND m.xp IS DISTINCT FROM x.xp
    RETURNING m.user_id
  `) as unknown[];
  return rows.length;
}

/**
 * Cron (owner connection): settle every finished week nobody has settled
 * yet — final rank, league size and promoted / held / demoted, using the same
 * zone rule as `settleOutcome`. A week counts as finished once it ended more
 * than a day ago in UTC, so every member's local Sunday is over. Idempotent.
 * Throws a missing-column error when migration 063 isn't applied.
 */
export async function settleLeagueWeeks(sql: SqlClient, now: Date = new Date()): Promise<number> {
  const today = toIsoDate(now) ?? now.toISOString().slice(0, 10);
  const rows = (await sql`
    WITH ranked AS (
      SELECT m.user_id, m.week_start, m.tier,
             rank() OVER (PARTITION BY m.league_id, m.week_start ORDER BY m.xp DESC)::int AS r,
             count(*) OVER (PARTITION BY m.league_id, m.week_start)::int AS n
      FROM app.league_memberships m
      WHERE m.week_start + 7 < ${today}::date
        AND (m.league_id, m.week_start) IN (
          SELECT league_id, week_start FROM app.league_memberships
          WHERE settled_at IS NULL AND week_start + 7 < ${today}::date
        )
    ),
    zoned AS (
      SELECT ranked.*,
             CASE WHEN n < 3 THEN CASE WHEN n >= 2 THEN 1 ELSE 0 END
                  ELSE greatest(1, floor(n * 0.2)::int) END AS promote,
             CASE WHEN n < 5 THEN 0 ELSE greatest(1, floor(n * 0.2)::int) END AS demote
      FROM ranked
    )
    UPDATE app.league_memberships m
    SET final_rank = z.r,
        league_size = z.n,
        result = CASE
          WHEN z.r <= z.promote AND z.tier < ${TOP_TIER} THEN 'promoted'
          WHEN z.demote > 0 AND z.r > z.n - z.demote AND z.tier > 0 THEN 'demoted'
          ELSE 'held' END,
        settled_at = now(),
        updated_at = now()
    FROM zoned z
    WHERE m.user_id = z.user_id AND m.week_start = z.week_start AND m.settled_at IS NULL
    RETURNING m.user_id
  `) as unknown[];
  return rows.length;
}
