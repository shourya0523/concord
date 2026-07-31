import {
  ConceptSchema,
  DiagramRefSchema,
  LearningModuleCheckpointSchema,
  LearningModuleSchema,
  LearningResourceSchema,
  type Concept,
  type DiagramRef,
  type LearningModule,
  type LearningModuleCheckpoint,
  type LearningResource,
} from "@ibpe/contracts";
import type {
  ConceptDetailResponse,
  ConceptListResponse,
  ConceptWithAssets,
  LearningModuleDetailResponse,
  LearningModuleListItem,
  LearningModuleListResponse,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  CONCEPTS,
  DIAGRAM_SOURCES,
  RESOURCES,
} from "@/lib/mock-data";

type ModuleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  track: string | null;
  domain: string | null;
  estimated_minutes: number | null;
  concept_ids: string[] | null;
  diagram_ids: string[] | null;
  prereq_module_ids: string[] | null;
};

type CheckpointRow = {
  id: string;
  module_id: string;
  kind: string;
  title: string;
  position: number;
  concept_id: string | null;
  diagram_id: string | null;
  question_ids: unknown;
};

const STUB_MODULES: LearningModule[] = [
  LearningModuleSchema.parse({
    id: "module_accounting_foundations",
    slug: "accounting-foundations",
    title: "Accounting Foundations",
    domain: "ib",
    track: "IB",
    summary: "Three-statement linkage and interview-ready accounting.",
    estimated_minutes: 45,
    concept_ids: ["concept_3stmt"],
    diagram_ids: ["diagram_three-statement-flow"],
    prereq_module_ids: [],
    checkpoints: [
      {
        id: "chk_acct_lesson",
        kind: "lesson",
        title: "Statement linkages",
        position: 0,
        concept_id: "concept_3stmt",
        question_ids: [],
      },
      {
        id: "chk_acct_diagram",
        kind: "diagram",
        title: "Three-statement diagram",
        position: 1,
        concept_id: "concept_3stmt",
        diagram_id: "diagram_three-statement-flow",
        question_ids: [],
      },
      {
        id: "chk_acct_drill",
        kind: "drill",
        title: "Accounting drill",
        position: 2,
        concept_id: "concept_3stmt",
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_acct_lesson"],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_ev_equity",
    slug: "enterprise-equity-value",
    title: "Enterprise Value & Equity Value",
    domain: "ib",
    track: "IB",
    summary: "EV bridges and equity value punchlines.",
    estimated_minutes: 40,
    concept_ids: ["concept_ev"],
    diagram_ids: ["diagram_ev-equity-bridge"],
    prereq_module_ids: ["module_accounting_foundations"],
    checkpoints: [
      {
        id: "chk_ev_lesson",
        kind: "lesson",
        title: "EV vs equity",
        position: 0,
        concept_id: "concept_ev",
        question_ids: [],
      },
      {
        id: "chk_ev_diagram",
        kind: "diagram",
        title: "EV bridge diagram",
        position: 1,
        concept_id: "concept_ev",
        diagram_id: "diagram_ev-equity-bridge",
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_ev_lesson"],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_dcf_wacc",
    slug: "dcf-and-wacc",
    title: "DCF & WACC",
    domain: "both",
    track: "IB",
    summary: "WACC build-up and DCF interview answers.",
    estimated_minutes: 50,
    concept_ids: ["concept_dcf"],
    diagram_ids: ["diagram_wacc-build-up"],
    prereq_module_ids: ["module_ev_equity"],
    checkpoints: [
      {
        id: "chk_dcf_diagram",
        kind: "diagram",
        title: "WACC build-up",
        position: 0,
        concept_id: "concept_dcf",
        diagram_id: "diagram_wacc-build-up",
        question_ids: [],
      },
      {
        id: "chk_dcf_quiz",
        kind: "quiz",
        title: "DCF checkpoint quiz",
        position: 1,
        concept_id: "concept_dcf",
        question_ids: [],
      },
    ],
    lesson_ids: [],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_lbo_paper",
    slug: "lbo-and-paper-lbo",
    title: "LBO & Paper LBO",
    domain: "pe",
    track: "PE",
    summary: "Sources & uses, MOIC, IRR intuition.",
    estimated_minutes: 55,
    concept_ids: ["concept_lbo"],
    diagram_ids: ["diagram_sources-uses"],
    prereq_module_ids: ["module_dcf_wacc"],
    checkpoints: [
      {
        id: "chk_lbo_diagram",
        kind: "diagram",
        title: "Sources and uses",
        position: 0,
        concept_id: "concept_lbo",
        diagram_id: "diagram_sources-uses",
        question_ids: [],
      },
      {
        id: "chk_lbo_drill",
        kind: "drill",
        title: "Paper LBO drill",
        position: 1,
        concept_id: "concept_lbo",
        question_ids: [],
      },
    ],
    lesson_ids: [],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_behavioral",
    slug: "behavioral-story-bank",
    title: "Behavioural Story Bank",
    domain: "both",
    track: "IB",
    summary: "Fit stories with firm-apply bridges.",
    estimated_minutes: 35,
    concept_ids: [],
    diagram_ids: [],
    prereq_module_ids: [],
    checkpoints: [
      {
        id: "chk_beh_lesson",
        kind: "lesson",
        title: "Story frameworks",
        position: 0,
        question_ids: [],
      },
      {
        id: "chk_beh_drill",
        kind: "drill",
        title: "Story delivery drill",
        position: 1,
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_beh_lesson"],
    publishable: true,
  }),
];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function domainFromTrack(track: string | null, domain: string | null): string {
  if (domain) return domain.toLowerCase();
  const t = track?.toLowerCase();
  if (t === "ib" || t === "pe" || t === "both") return t;
  return "both";
}

function rowToModule(
  row: ModuleRow,
  checkpoints: LearningModuleCheckpoint[],
): LearningModuleListItem {
  const conceptIds = asStringArray(row.concept_ids);
  const diagramIds =
    asStringArray(row.diagram_ids).length > 0
      ? asStringArray(row.diagram_ids)
      : checkpoints
          .map((c) => c.diagram_id)
          .filter((id): id is string => Boolean(id));
  return LearningModuleSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    domain: domainFromTrack(row.track, row.domain),
    track: row.track,
    summary: row.summary ?? "",
    estimated_minutes: Math.max(
      1,
      row.estimated_minutes ?? (checkpoints.length > 0 ? checkpoints.length * 10 : 10),
    ),
    concept_ids: conceptIds,
    diagram_ids: diagramIds,
    prereq_module_ids: asStringArray(row.prereq_module_ids),
    checkpoints,
    lesson_ids: checkpoints.filter((c) => c.kind === "lesson").map((c) => c.id),
    publishable: true,
  });
}

function rowToCheckpoint(row: CheckpointRow): LearningModuleCheckpoint {
  return LearningModuleCheckpointSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title,
    position: Number(row.position) || 0,
    concept_id: row.concept_id,
    diagram_id: row.diagram_id,
    question_ids: asStringArray(row.question_ids),
  });
}

async function loadModulesFromDb(): Promise<LearningModuleListItem[] | null> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT
      m.id,
      m.slug,
      m.title,
      m.summary,
      m.track,
      m.domain,
      m.estimated_minutes,
      coalesce(
        (
          SELECT jsonb_agg(mc.concept_id)
          FROM canonical.learning_module_concepts mc
          WHERE mc.module_id = m.id
        ),
        '[]'::jsonb
      ) AS concept_ids,
      coalesce(
        (
          SELECT jsonb_agg(p.prerequisite_module_id)
          FROM canonical.learning_module_prerequisites p
          WHERE p.module_id = m.id
        ),
        '[]'::jsonb
      ) AS prereq_module_ids,
      coalesce(
        (
          SELECT jsonb_agg(DISTINCT cp.diagram_id)
          FROM canonical.learning_module_checkpoints cp
          WHERE cp.module_id = m.id AND cp.diagram_id IS NOT NULL
        ),
        '[]'::jsonb
      ) AS diagram_ids
    FROM canonical.learning_modules m
    WHERE m.publishable = true
    ORDER BY m.title ASC
  `) as ModuleRow[];

  if (rows.length === 0) return null;

  const checkpointRows = (await sql`
    SELECT
      id, module_id, kind, title, position, concept_id, diagram_id, question_ids
    FROM published.v_learning_module_checkpoints
    ORDER BY module_id ASC, position ASC
  `) as CheckpointRow[];

  const byModule = new Map<string, LearningModuleCheckpoint[]>();
  for (const row of checkpointRows) {
    const list = byModule.get(row.module_id) ?? [];
    list.push(rowToCheckpoint(row));
    byModule.set(row.module_id, list);
  }

  return rows.map((row) =>
    rowToModule(row, byModule.get(row.id) ?? []),
  );
}

export function listStubLearningModules(): LearningModuleListItem[] {
  return STUB_MODULES.map((module) => LearningModuleSchema.parse(module));
}

export async function listLearningModules(): Promise<LearningModuleListResponse> {
  if (!isDatabaseConfigured()) {
    return {
      items: listStubLearningModules(),
      source: "stub",
      note: "DATABASE_URL unset — static MVP modules.",
    };
  }

  try {
    const items = await loadModulesFromDb();
    if (!items) {
      return {
        items: listStubLearningModules(),
        source: "stub",
        note: "No publishable modules in DB — static MVP fallback.",
      };
    }
    return { items, source: "published" };
  } catch (err) {
    console.warn("[learn] DB module list failed; using stubs", err);
    return {
      items: listStubLearningModules(),
      source: "stub",
      note: "DB module read failed — static MVP fallback.",
    };
  }
}

export async function getLearningModule(
  slug: string,
): Promise<LearningModuleDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const learningModule = listStubLearningModules().find(
      (item) => item.slug === slug || item.id === slug,
    );
    if (!learningModule) return null;
    return {
      module: learningModule,
      checkpoints: learningModule.checkpoints,
      source: "stub",
      note: "DATABASE_URL unset — static MVP module.",
    };
  }

  try {
    const items = await loadModulesFromDb();
    const learningModule = items?.find(
      (item) => item.slug === slug || item.id === slug,
    );
    if (learningModule) {
      return {
        module: learningModule,
        checkpoints: [...learningModule.checkpoints].sort(
          (a, b) => a.position - b.position,
        ),
        source: "published",
      };
    }
  } catch (err) {
    console.warn("[learn] DB module detail failed; using stub", err);
  }

  const stub = listStubLearningModules().find(
    (item) => item.slug === slug || item.id === slug,
  );
  if (!stub) return null;
  return {
    module: stub,
    checkpoints: stub.checkpoints,
    source: "stub",
    note: "Module not in DB — static MVP fallback.",
  };
}

type ConceptRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  track: string | null;
};

function rowToConcept(row: ConceptRow): Concept {
  return ConceptSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    prerequisites: [],
    firm_relevance: {},
    domain:
      row.track?.toLowerCase() === "ib" || row.track?.toLowerCase() === "pe"
        ? row.track.toLowerCase()
        : "both",
    summary: row.summary ?? undefined,
  });
}

function diagramRefsForConcept(concept: Concept): DiagramRef[] {
  const source = DIAGRAM_SOURCES[concept.slug];
  if (!source) return [];
  return [
    DiagramRefSchema.parse({
      id: `diagram_${concept.slug}`,
      type: source.title,
      format: "mermaid",
      version: "1",
      a11y_fallback: source.a11y,
      concept_ids: [concept.id],
    }),
  ];
}

function resourcesForConceptId(conceptId: string): LearningResource[] {
  return RESOURCES.filter((resource) => resource.concept_ids.includes(conceptId));
}

function conceptWithAssets(concept: Concept): ConceptWithAssets {
  return {
    concept,
    diagram_refs: diagramRefsForConcept(concept),
    resources: resourcesForConceptId(concept.id),
  };
}

export async function listConcepts(): Promise<ConceptListResponse> {
  if (!isDatabaseConfigured()) {
    return {
      items: CONCEPTS.map(conceptWithAssets),
      source: "stub",
    };
  }

  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT id, slug, title, summary, track
      FROM published.v_concepts
      ORDER BY title ASC
      LIMIT 100
    `) as ConceptRow[];
    if (rows.length === 0) {
      return { items: CONCEPTS.map(conceptWithAssets), source: "stub" };
    }
    return {
      items: rows.map((row) => conceptWithAssets(rowToConcept(row))),
      source: "published",
    };
  } catch (err) {
    console.warn("[concepts] DB read failed; using stub concepts", err);
    return {
      items: CONCEPTS.map(conceptWithAssets),
      source: "stub",
    };
  }
}

export async function getConceptDetail(
  slugOrId: string,
): Promise<ConceptDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const concept = CONCEPTS.find(
      (item) => item.slug === slugOrId || item.id === slugOrId,
    );
    return concept ? { item: conceptWithAssets(concept), source: "stub" } : null;
  }

  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT id, slug, title, summary, track
      FROM published.v_concepts
      WHERE slug = ${slugOrId} OR id = ${slugOrId}
      LIMIT 1
    `) as ConceptRow[];
    const row = rows[0];
    if (row) {
      return { item: conceptWithAssets(rowToConcept(row)), source: "published" };
    }
  } catch (err) {
    console.warn("[concepts] DB detail failed; using stub concept", err);
  }

  const concept = CONCEPTS.find(
    (item) => item.slug === slugOrId || item.id === slugOrId,
  );
  return concept ? { item: conceptWithAssets(concept), source: "stub" } : null;
}

export function resourcesForConcepts(conceptIds: string[]): LearningResource[] {
  const allow = new Set(conceptIds);
  return RESOURCES.filter((resource) =>
    resource.concept_ids.some((id) => allow.has(id)),
  ).map((resource) => LearningResourceSchema.parse(resource));
}

export function diagramsForConcepts(conceptIds: string[]): DiagramRef[] {
  const allow = new Set(conceptIds);
  return CONCEPTS.filter((concept) => allow.has(concept.id)).flatMap(
    diagramRefsForConcept,
  );
}
