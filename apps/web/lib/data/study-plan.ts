import { randomUUID } from "node:crypto";
import type {
  LocalStudyPlan,
  StudyPlanResponse,
  UpdateStudyPlanRequest,
} from "@/lib/api/schemas";
import { LocalStudyPlanSchema } from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { withRlsUserId } from "@/lib/db/rls";
import { listStubLearningModules } from "./learning";
import { ensureAppUserQuery } from "./users";

const stubPlans = new Map<string, LocalStudyPlan>();

function defaultStudyPlan(userId: string): LocalStudyPlan {
  const now = new Date().toISOString();
  const firstModule = listStubLearningModules()[0];
  return LocalStudyPlanSchema.parse({
    id: `plan_${userId}`,
    user_id: userId,
    title: "Interview study plan",
    learning_mode: "company_prep",
    firm_ids: [],
    concept_ids: firstModule?.concept_ids ?? [],
    weak_topic_ids: [],
    items: firstModule
      ? [{ kind: "module", id: firstModule.id, due_at: null }]
      : [],
    created_at: now,
    updated_at: now,
  });
}

function inputToPlan(
  userId: string,
  input: UpdateStudyPlanRequest,
  existing?: LocalStudyPlan | null,
): LocalStudyPlan {
  const now = new Date().toISOString();
  return LocalStudyPlanSchema.parse({
    id: existing?.id ?? `plan_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    user_id: userId,
    title: input.title,
    learning_mode: input.learning_mode,
    firm_ids: input.firm_ids,
    concept_ids: input.concept_ids,
    weak_topic_ids: input.weak_topic_ids,
    items: input.items,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
}

export async function getStudyPlan(userId: string): Promise<StudyPlanResponse> {
  const stub = stubPlans.get(userId);
  if (stub) return { plan: stub, source: "stub" };

  if (!isDatabaseConfigured()) {
    return {
      plan: defaultStudyPlan(userId),
      source: "stub",
      note: "DATABASE_URL unset — using default study plan.",
    };
  }

  try {
    const sql = requireSql();
    const results = await withRlsUserId(sql, userId, (s) => [
      s`
        SELECT p.id, p.user_id, p.name, p.plan_json, p.created_at
        FROM app.study_plans p
        JOIN app.users u ON u.id = p.user_id
        WHERE u.neon_auth_user_id = ${userId}
        ORDER BY p.created_at DESC
        LIMIT 1
      `,
    ]);
    const rows = (results[0] ?? []) as Array<{
      id: string;
      user_id: string;
      name: string;
      plan_json: Record<string, unknown>;
      created_at: string;
    }>;
    const row = rows[0];
    if (!row) {
      return {
        plan: defaultStudyPlan(userId),
        source: "stub",
        note: "No saved study plan yet.",
      };
    }
    const parsed = LocalStudyPlanSchema.safeParse({
      ...row.plan_json,
      id: row.id,
      user_id: userId,
      title: row.name,
      created_at: new Date(row.created_at).toISOString(),
      updated_at:
        typeof row.plan_json.updated_at === "string"
          ? row.plan_json.updated_at
          : new Date(row.created_at).toISOString(),
    });
    if (parsed.success) return { plan: parsed.data, source: "published" };
    return {
      plan: defaultStudyPlan(userId),
      source: "stub",
      note: "Saved study plan failed local schema validation.",
    };
  } catch (err) {
    console.warn("[study-plan] DB read failed; using stub plan", err);
    return {
      plan: defaultStudyPlan(userId),
      source: "stub",
      note: "DB study-plan read failed — using default plan.",
    };
  }
}

export async function putStudyPlan(options: {
  userId: string;
  email?: string | null;
  input: UpdateStudyPlanRequest;
}): Promise<StudyPlanResponse> {
  const { userId, email, input } = options;
  const existing = stubPlans.get(userId) ?? null;
  const plan = inputToPlan(userId, input, existing);

  if (!isDatabaseConfigured()) {
    stubPlans.set(userId, plan);
    return {
      plan,
      source: "stub",
      note: "DATABASE_URL unset — saved study plan in memory.",
    };
  }

  try {
    const sql = requireSql();
    const planJson = {
      learning_mode: plan.learning_mode,
      firm_ids: plan.firm_ids,
      concept_ids: plan.concept_ids,
      weak_topic_ids: plan.weak_topic_ids,
      items: plan.items,
      updated_at: plan.updated_at,
    };
    await withRlsUserId(sql, userId, (s) => [
      ensureAppUserQuery(s, userId, email),
      s`
        INSERT INTO app.study_plans (id, user_id, name, plan_json)
        VALUES (
          ${plan.id},
          (SELECT id FROM app.users WHERE neon_auth_user_id = ${userId} LIMIT 1),
          ${plan.title},
          ${JSON.stringify(planJson)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          plan_json = EXCLUDED.plan_json
      `,
    ]);
    return { plan, source: "published" };
  } catch (err) {
    console.warn("[study-plan] DB write failed; saving in memory", err);
    stubPlans.set(userId, plan);
    return {
      plan,
      source: "stub",
      note: "DB study-plan write failed — saved plan in memory.",
    };
  }
}
