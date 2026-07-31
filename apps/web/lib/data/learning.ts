import {
  ConceptSchema,
  DiagramRefSchema,
  LearningResourceSchema,
  type Concept,
  type DiagramRef,
  type LearningResource,
} from "@ibpe/contracts";
import type {
  ConceptDetailResponse,
  ConceptListResponse,
  ConceptWithAssets,
  LearningModule,
  LearningModuleCheckpoint,
  LearningModuleDetailResponse,
  LearningModuleListResponse,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import {
  CONCEPTS,
  DIAGRAM_SOURCES,
  RESOURCES,
} from "@/lib/mock-data";

type ModuleSeed = {
  module: Omit<LearningModule, "checkpoint_count" | "estimated_minutes">;
  checkpoints: LearningModuleCheckpoint[];
};

const MODULE_SEEDS: ModuleSeed[] = [
  {
    module: {
      id: "module_ib_accounting_foundations",
      slug: "ib-accounting-foundations",
      title: "IB accounting foundations",
      summary:
        "Three-statement linkage checkpoints for company-prep technical screens.",
      learning_mode: "concept_learn",
      track: "IB",
      publishable: true,
      concept_ids: ["concept_3stmt", "concept_ev"],
      firm_ids: ["firm_gs", "firm_ms", "firm_ev"],
    },
    checkpoints: [
      {
        id: "chk_3stmt_flow",
        slug: "three-statement-flow",
        title: "Trace net income through the statements",
        kind: "diagram",
        concept_ids: ["concept_3stmt"],
        question_ids: [],
        resource_ids: ["res_3stmt"],
        estimated_minutes: 12,
        order: 0,
      },
      {
        id: "chk_ev_bridge",
        slug: "enterprise-equity-bridge",
        title: "Enterprise value to equity value bridge",
        kind: "drill",
        concept_ids: ["concept_ev"],
        question_ids: [],
        resource_ids: [],
        estimated_minutes: 10,
        order: 1,
      },
    ],
  },
  {
    module: {
      id: "module_dcf_interview",
      slug: "dcf-interview-readiness",
      title: "DCF interview readiness",
      summary: "WACC, terminal value, and concise valuation explanations.",
      learning_mode: "concept_learn",
      track: "both",
      publishable: true,
      concept_ids: ["concept_dcf"],
      firm_ids: ["firm_gs", "firm_ms", "firm_ev"],
    },
    checkpoints: [
      {
        id: "chk_dcf_wacc",
        slug: "wacc-build-up",
        title: "Build WACC from first principles",
        kind: "diagram",
        concept_ids: ["concept_dcf"],
        question_ids: [],
        resource_ids: ["res_damodaran"],
        estimated_minutes: 15,
        order: 0,
      },
      {
        id: "chk_dcf_reveal",
        slug: "dcf-layered-answer",
        title: "Practise a layered DCF answer",
        kind: "drill",
        concept_ids: ["concept_dcf"],
        question_ids: [],
        resource_ids: [],
        estimated_minutes: 12,
        order: 1,
      },
    ],
  },
  {
    module: {
      id: "module_pe_lbo_basics",
      slug: "pe-lbo-basics",
      title: "PE LBO basics",
      summary: "Sources and uses, debt paydown, MOIC, and IRR intuition.",
      learning_mode: "company_prep",
      track: "PE",
      publishable: true,
      concept_ids: ["concept_lbo"],
      firm_ids: ["firm_bx", "firm_kkr"],
    },
    checkpoints: [
      {
        id: "chk_lbo_sources_uses",
        slug: "sources-and-uses",
        title: "Sketch sources and uses",
        kind: "diagram",
        concept_ids: ["concept_lbo"],
        question_ids: [],
        resource_ids: ["res_lbo_internal"],
        estimated_minutes: 12,
        order: 0,
      },
      {
        id: "chk_lbo_returns",
        slug: "paper-lbo-returns",
        title: "Paper LBO returns intuition",
        kind: "drill",
        concept_ids: ["concept_lbo"],
        question_ids: [],
        resource_ids: [],
        estimated_minutes: 18,
        order: 1,
      },
    ],
  },
  {
    module: {
      id: "module_simulator_technical",
      slug: "technical-simulator-warmup",
      title: "Technical simulator warmup",
      summary:
        "Stage-based IB/PE practice blocks for simulator sessions.",
      learning_mode: "company_prep",
      track: "both",
      publishable: true,
      concept_ids: ["concept_3stmt", "concept_dcf", "concept_lbo"],
      firm_ids: ["firm_gs", "firm_bx"],
    },
    checkpoints: [
      {
        id: "chk_sim_ib",
        slug: "ib-technical-stage",
        title: "IB accounting and valuation stage",
        kind: "simulation",
        concept_ids: ["concept_3stmt", "concept_dcf"],
        question_ids: [],
        resource_ids: [],
        estimated_minutes: 20,
        order: 0,
      },
      {
        id: "chk_sim_pe",
        slug: "pe-investing-stage",
        title: "PE LBO and investing judgement stage",
        kind: "simulation",
        concept_ids: ["concept_lbo"],
        question_ids: [],
        resource_ids: [],
        estimated_minutes: 20,
        order: 1,
      },
    ],
  },
];

function withModuleRollups(seed: ModuleSeed): LearningModule {
  const estimated_minutes = seed.checkpoints.reduce(
    (total, checkpoint) => total + checkpoint.estimated_minutes,
    0,
  );
  return {
    ...seed.module,
    checkpoint_count: seed.checkpoints.length,
    estimated_minutes,
  };
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

export function listStubLearningModules(): LearningModule[] {
  return MODULE_SEEDS.map(withModuleRollups);
}

export async function listLearningModules(): Promise<LearningModuleListResponse> {
  // TODO(DB): replace seeds with canonical learning_modules when database branch lands.
  return {
    items: listStubLearningModules(),
    source: "stub",
    note: "Static MVP modules until learning module tables land.",
  };
}

export async function getLearningModule(
  slug: string,
): Promise<LearningModuleDetailResponse | null> {
  const seed = MODULE_SEEDS.find(
    (item) => item.module.slug === slug || item.module.id === slug,
  );
  if (!seed) return null;
  return {
    module: withModuleRollups(seed),
    checkpoints: [...seed.checkpoints].sort((a, b) => a.order - b.order),
    source: "stub",
    note: "Static MVP module until learning module tables land.",
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
