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
  DiagramAsset,
  LearningModuleDetailResponse,
  LearningModuleListItem,
  LearningModuleListResponse,
} from "@/lib/api/schemas";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import { topicForConceptId } from "@/lib/topics";

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

type ConceptRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  track: string | null;
};

type DiagramRow = {
  id: string;
  slug: string;
  title: string;
  a11y_fallback: string | null;
  format: string | null;
  version: number | null;
  body: string | null;
};

type ResourceRow = {
  id: string;
  label: string;
  url: string;
  kind: string;
  provenance: string;
  concept_id: string | null;
};

/** concept_id → diagram_id (stable DB convention). */
const CONCEPT_DIAGRAM: Record<string, string> = {
  concept_accounting_foundations: "diag_three_statement",
  concept_ev_equity_value: "diag_ev_bridge",
  concept_dcf_wacc: "diag_dcf_wacc",
  concept_lbo_paper_lbo: "diag_lbo_sources_uses",
}

const STUB_DIAGRAM_BODIES: Record<
  string,
  { title: string; mermaid: string; a11y: string }
> = {
  diag_three_statement: {
    title: "Three-statement linkages",
    mermaid: `flowchart TB
  IS[Income statement] -->|Net income| CFS[Cash flow statement]
  IS -->|Retained earnings| BS[Balance sheet]
  CFS -->|Ending cash| BS`,
    a11y:
      "Net income flows from the income statement into the cash flow statement and retained earnings on the balance sheet. Ending cash from the cash flow statement updates the balance sheet cash line.",
  },
  diag_ev_bridge: {
    title: "EV to Equity Bridge",
    mermaid: `flowchart LR
  EV[Enterprise Value] --> Debt[Subtract Net Debt]
  Debt --> Equity[Equity Value]`,
    a11y:
      "Start with enterprise value, subtract net debt and other claims to arrive at equity value.",
  },
  diag_dcf_wacc: {
    title: "DCF and WACC Flow",
    mermaid: `flowchart LR
  FCF[Free Cash Flow] --> TV[Terminal Value]
  TV --> WACC[Discount at WACC]
  WACC --> EV[Enterprise Value]`,
    a11y:
      "Unlevered free cash flows and terminal value are discounted at WACC to enterprise value, then bridged to equity value.",
  },
  diag_lbo_sources_uses: {
    title: "LBO Sources and Uses",
    mermaid: `flowchart LR
  Uses[Purchase Price and Fees] --> Sources[Debt plus Sponsor Equity]
  Sources --> Returns[Exit Equity Value]`,
    a11y:
      "Sources: sponsor equity and debt facilities fund the buyout. Uses: acquire target equity, refinance debt, and pay fees.",
  },
}

const STUB_CONCEPTS: Concept[] = [
  ConceptSchema.parse({
    id: "concept_accounting_foundations",
    slug: "accounting-foundations",
    title: "Accounting Foundations",
    prerequisites: [],
    firm_relevance: {},
    domain: "ib",
    summary: "Three-statement linkage and interview-ready accounting.",
  }),
  ConceptSchema.parse({
    id: "concept_ev_equity_value",
    slug: "ev-equity-value",
    title: "EV and Equity Value",
    prerequisites: ["concept_accounting_foundations"],
    firm_relevance: {},
    domain: "ib",
    summary: "Bridge from enterprise value to equity value via net debt and other claims.",
  }),
  ConceptSchema.parse({
    id: "concept_dcf_wacc",
    slug: "dcf-wacc",
    title: "DCF and WACC",
    prerequisites: ["concept_accounting_foundations"],
    firm_relevance: {},
    domain: "both",
    summary: "Unlevered free cash flow, WACC build-up, terminal value.",
  }),
  ConceptSchema.parse({
    id: "concept_lbo_paper_lbo",
    slug: "lbo-paper-lbo",
    title: "LBO and Paper LBO",
    prerequisites: ["concept_dcf_wacc"],
    firm_relevance: {},
    domain: "pe",
    summary: "Sources and uses, debt schedule, returns to equity at exit.",
  }),
  ConceptSchema.parse({
    id: "concept_behavioural_story",
    slug: "behavioural-story",
    title: "Behavioural Story",
    prerequisites: [],
    firm_relevance: {},
    domain: "both",
    summary: "Fit stories with firm-apply bridges.",
  }),
]

const STUB_MODULES: LearningModule[] = [
  LearningModuleSchema.parse({
    id: "module_accounting_foundations",
    slug: "accounting-foundations",
    title: "Accounting Foundations",
    domain: "ib",
    track: "IB",
    summary: "Build the three-statement base required for technical interview answers.",
    estimated_minutes: 45,
    concept_ids: ["concept_accounting_foundations"],
    diagram_ids: ["diag_three_statement"],
    prereq_module_ids: [],
    checkpoints: [
      {
        id: "chk_acct_lesson",
        kind: "lesson",
        title: "Three statements and accrual logic",
        position: 1,
        concept_id: "concept_accounting_foundations",
        question_ids: [],
      },
      {
        id: "chk_acct_drill",
        kind: "drill",
        title: "Working capital and depreciation drill",
        position: 2,
        concept_id: "concept_accounting_foundations",
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_acct_lesson"],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_ev_equity_value",
    slug: "ev-equity-value",
    title: "EV and Equity Value",
    domain: "ib",
    track: "IB",
    summary: "Learn the bridge between enterprise value, equity value, and claims.",
    estimated_minutes: 40,
    concept_ids: ["concept_ev_equity_value"],
    diagram_ids: ["diag_ev_bridge"],
    prereq_module_ids: ["module_accounting_foundations"],
    checkpoints: [
      {
        id: "chk_ev_lesson",
        kind: "lesson",
        title: "EV versus equity value",
        position: 1,
        concept_id: "concept_ev_equity_value",
        question_ids: [],
      },
      {
        id: "chk_ev_diagram",
        kind: "diagram",
        title: "EV to equity bridge",
        position: 2,
        concept_id: "concept_ev_equity_value",
        diagram_id: "diag_ev_bridge",
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_ev_lesson"],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_dcf_wacc",
    slug: "dcf-wacc",
    title: "DCF and WACC",
    domain: "both",
    track: "IB",
    summary: "Turn forecasts into value with WACC, terminal value, and sensitivities.",
    estimated_minutes: 50,
    concept_ids: ["concept_dcf_wacc"],
    diagram_ids: ["diag_dcf_wacc"],
    prereq_module_ids: ["module_ev_equity_value"],
    checkpoints: [
      {
        id: "chk_dcf_lesson",
        kind: "lesson",
        title: "Forecasts, WACC, and terminal value",
        position: 1,
        concept_id: "concept_dcf_wacc",
        question_ids: [],
      },
      {
        id: "chk_dcf_diagram",
        kind: "diagram",
        title: "DCF flow diagram",
        position: 2,
        concept_id: "concept_dcf_wacc",
        diagram_id: "diag_dcf_wacc",
        question_ids: [],
      },
    ],
    lesson_ids: ["chk_dcf_lesson"],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_lbo_paper_lbo",
    slug: "lbo-paper-lbo",
    title: "LBO and Paper LBO",
    domain: "pe",
    track: "PE",
    summary: "Practice sponsor returns math and paper LBO shortcuts.",
    estimated_minutes: 55,
    concept_ids: ["concept_lbo_paper_lbo"],
    diagram_ids: ["diag_lbo_sources_uses"],
    prereq_module_ids: ["module_dcf_wacc"],
    checkpoints: [
      {
        id: "chk_lbo_lab",
        kind: "concept_lab",
        title: "Paper LBO returns lab",
        position: 1,
        concept_id: "concept_lbo_paper_lbo",
        diagram_id: "diag_lbo_sources_uses",
        question_ids: [],
      },
      {
        id: "chk_lbo_quiz",
        kind: "quiz",
        title: "LBO returns quiz",
        position: 2,
        concept_id: "concept_lbo_paper_lbo",
        question_ids: [],
      },
    ],
    lesson_ids: [],
    publishable: true,
  }),
  LearningModuleSchema.parse({
    id: "module_behavioural_story",
    slug: "behavioural-story",
    title: "Behavioural Story",
    domain: "both",
    track: "IB",
    summary: "Shape fit, motivation, and deal stories for banking and PE interviews.",
    estimated_minutes: 35,
    concept_ids: ["concept_behavioural_story"],
    diagram_ids: [],
    prereq_module_ids: [],
    checkpoints: [
      {
        id: "chk_beh_lesson",
        kind: "lesson",
        title: "Personal story structure",
        position: 1,
        concept_id: "concept_behavioural_story",
        question_ids: [],
      },
      {
        id: "chk_beh_drill",
        kind: "drill",
        title: "Why this firm and why this role",
        position: 2,
        concept_id: "concept_behavioural_story",
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

/**
 * Fill empty drill/quiz/concept_lab checkpoints with real published questions
 * for the checkpoint concept's topic (teaching corpus, not Glassdoor text).
 */
async function fillCheckpointQuestions(
  checkpoints: LearningModuleCheckpoint[],
): Promise<LearningModuleCheckpoint[]> {
  const needs = checkpoints.filter(
    (checkpoint) =>
      checkpoint.question_ids.length === 0 &&
      (checkpoint.kind === "drill" ||
        checkpoint.kind === "quiz" ||
        checkpoint.kind === "concept_lab") &&
      checkpoint.concept_id &&
      topicForConceptId(checkpoint.concept_id),
  );
  if (needs.length === 0 || !isDatabaseConfigured()) return checkpoints;

  try {
    const sql = requireSql();
    const topics = [...new Set(needs.map((c) => topicForConceptId(c.concept_id!)!))];
    const rows = (await sql`
      SELECT id, topic
      FROM published.v_questions
      WHERE topic = ANY(${topics}::text[])
      ORDER BY updated_at DESC NULLS LAST, id
      LIMIT 120
    `) as Array<{ id: string; topic: string | null }>;

    const byTopic = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.topic) continue;
      const list = byTopic.get(row.topic) ?? [];
      if (list.length < 6) list.push(row.id);
      byTopic.set(row.topic, list);
    }

    return checkpoints.map((checkpoint) => {
      if (checkpoint.question_ids.length > 0 || !checkpoint.concept_id) {
        return checkpoint;
      }
      const topic = topicForConceptId(checkpoint.concept_id);
      const ids = topic ? (byTopic.get(topic) ?? []) : [];
      return LearningModuleCheckpointSchema.parse({
        ...checkpoint,
        question_ids: ids,
      });
    });
  } catch (err) {
    console.warn("[learn] checkpoint question fill failed", err);
    return checkpoints;
  }
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
      const checkpoints = await fillCheckpointQuestions(
        [...learningModule.checkpoints].sort((a, b) => a.position - b.position),
      );
      return {
        module: learningModule,
        checkpoints,
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

// ---------------------------------------------------------------------------
// Concepts, diagrams, resources (DB-backed)
// ---------------------------------------------------------------------------

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

async function loadDiagramAssets(): Promise<Map<string, DiagramAsset>> {
  const map = new Map<string, DiagramAsset>();
  if (!isDatabaseConfigured()) {
    for (const [id, stub] of Object.entries(STUB_DIAGRAM_BODIES)) {
      map.set(id, {
        ref: DiagramRefSchema.parse({
          id,
          type: stub.title,
          format: "mermaid",
          version: "1",
          a11y_fallback: stub.a11y,
          concept_ids: [],
        }),
        title: stub.title,
        body: stub.mermaid,
      });
    }
    return map;
  }
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT
        d.id,
        d.slug,
        d.title,
        d.a11y_fallback,
        dv.format,
        dv.version,
        dv.body
      FROM canonical.diagrams d
      LEFT JOIN LATERAL (
        SELECT format, version, body
        FROM canonical.diagram_versions v
        WHERE v.diagram_id = d.id
        ORDER BY version DESC
        LIMIT 1
      ) dv ON true
    `) as DiagramRow[];
    for (const row of rows) {
      if (!row.body) continue;
      map.set(row.id, {
        ref: DiagramRefSchema.parse({
          id: row.id,
          type: row.title,
          format: row.format === "interactive-json" ? "interactive-json" : "mermaid",
          version: String(row.version ?? 1),
          a11y_fallback: row.a11y_fallback ?? undefined,
          concept_ids: [],
        }),
        title: row.title,
        body: row.body,
      });
    }
  } catch (err) {
    console.warn("[learn] diagram load failed; using code-registered diagrams", err);
    return loadDiagramAssetsFallback();
  }
  if (map.size === 0) return loadDiagramAssetsFallback();
  return map;
}

function loadDiagramAssetsFallback(): Map<string, DiagramAsset> {
  const map = new Map<string, DiagramAsset>();
  for (const [id, stub] of Object.entries(STUB_DIAGRAM_BODIES)) {
    map.set(id, {
      ref: DiagramRefSchema.parse({
        id,
        type: stub.title,
        format: "mermaid",
        version: "1",
        a11y_fallback: stub.a11y,
        concept_ids: [],
      }),
      title: stub.title,
      body: stub.mermaid,
    });
  }
  return map;
}

async function loadResourcesByConcept(): Promise<Map<string, LearningResource[]>> {
  const map = new Map<string, LearningResource[]>();
  if (!isDatabaseConfigured()) return map;
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT r.id, r.label, r.url, r.kind, r.provenance, l.concept_id
      FROM canonical.learning_resources r
      JOIN canonical.resource_links l
        ON l.resource_id = r.id AND l.link_type = 'concept'
    `) as ResourceRow[];
    for (const row of rows) {
      if (!row.concept_id) continue;
      const resource = LearningResourceSchema.parse({
        id: row.id,
        label: row.label,
        url: row.url,
        kind: row.kind === "internal" ? "internal" : "external",
        provenance:
          row.provenance === "github_source" ||
          row.provenance === "static_seed" ||
          row.provenance === "gemini_synthesised"
            ? row.provenance
            : "editorial",
        concept_ids: [row.concept_id],
        firm_ids: [],
      });
      const list = map.get(row.concept_id) ?? [];
      list.push(resource);
      map.set(row.concept_id, list);
    }
  } catch (err) {
    console.warn("[learn] resource load failed", err);
  }
  return map;
}

/** Real firm relevance per concept: concept topic × firm heat intensity. */
async function loadFirmRelevanceByConcept(): Promise<
  Map<string, Record<string, number>>
> {
  const map = new Map<string, Record<string, number>>();
  if (!isDatabaseConfigured()) return map;
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT firm_id, topic_id, intensity
      FROM published.v_firm_topic_heat
      WHERE topic_id <> 'untagged' AND intensity >= 0.5
    `) as Array<{ firm_id: string; topic_id: string; intensity: number }>;
    const byTopic = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const entry = byTopic.get(row.topic_id) ?? {};
      entry[row.firm_id] = Math.max(entry[row.firm_id] ?? 0, Number(row.intensity));
      byTopic.set(row.topic_id, entry);
    }
    for (const conceptId of Object.keys(CONCEPT_DIAGRAM)) {
      const topic = topicForConceptId(conceptId);
      if (topic && byTopic.has(topic)) {
        map.set(conceptId, byTopic.get(topic)!);
      }
    }
  } catch (err) {
    console.warn("[learn] firm relevance load failed", err);
  }
  return map;
}

function conceptWithAssets(options: {
  concept: Concept;
  diagrams: Map<string, DiagramAsset>;
  resources: Map<string, LearningResource[]>;
  firmRelevance: Map<string, Record<string, number>>;
}): ConceptWithAssets {
  const { concept, diagrams, resources, firmRelevance } = options;
  const diagramId = CONCEPT_DIAGRAM[concept.id];
  const asset = diagramId ? diagrams.get(diagramId) : undefined;
  const topic = topicForConceptId(concept.id);
  const enriched = ConceptSchema.parse({
    ...concept,
    firm_relevance: firmRelevance.get(concept.id) ?? concept.firm_relevance,
  });
  return {
    concept: enriched,
    topic,
    diagram_refs: asset ? [asset.ref] : [],
    diagrams: asset ? [asset] : [],
    resources: resources.get(concept.id) ?? [],
  };
}

async function conceptAssets(rows: ConceptRow[]): Promise<ConceptWithAssets[]> {
  const [diagrams, resources, firmRelevance] = await Promise.all([
    loadDiagramAssets(),
    loadResourcesByConcept(),
    loadFirmRelevanceByConcept(),
  ]);
  return rows.map((row) =>
    conceptWithAssets({
      concept: rowToConcept(row),
      diagrams,
      resources,
      firmRelevance,
    }),
  );
}

function stubConceptItems(): ConceptWithAssets[] {
  const diagrams = loadDiagramAssetsFallback();
  return STUB_CONCEPTS.map((concept) =>
    conceptWithAssets({
      concept,
      diagrams,
      resources: new Map(),
      firmRelevance: new Map(),
    }),
  );
}

export async function listConcepts(): Promise<ConceptListResponse> {
  if (!isDatabaseConfigured()) {
    return { items: stubConceptItems(), source: "stub" };
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
      return { items: stubConceptItems(), source: "stub" };
    }
    return { items: await conceptAssets(rows), source: "published" };
  } catch (err) {
    console.warn("[concepts] DB read failed; using stub concepts", err);
    return { items: stubConceptItems(), source: "stub" };
  }
}

export async function getConceptDetail(
  slugOrId: string,
): Promise<ConceptDetailResponse | null> {
  if (!isDatabaseConfigured()) {
    const item = stubConceptItems().find(
      (entry) =>
        entry.concept.slug === slugOrId || entry.concept.id === slugOrId,
    );
    return item ? { item, source: "stub" } : null;
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
      const [item] = await conceptAssets([row]);
      return { item: item!, source: "published" };
    }
  } catch (err) {
    console.warn("[concepts] DB detail failed; using stub concept", err);
  }

  const item = stubConceptItems().find(
    (entry) => entry.concept.slug === slugOrId || entry.concept.id === slugOrId,
  );
  return item ? { item, source: "stub" } : null;
}

/** Resolved diagram asset for a concept (DB first, code-registered fallback). */
export async function getDiagramAssetForConcept(
  conceptId: string,
): Promise<DiagramAsset | null> {
  const diagramId = CONCEPT_DIAGRAM[conceptId];
  if (!diagramId) return null;
  const assets = await loadDiagramAssets();
  return assets.get(diagramId) ?? null;
}

/** Published teaching questions for a concept's topic (drill linking). */
export async function listQuestionsForConcept(
  conceptId: string,
  limit = 6,
): Promise<Array<{ id: string; canonical_wording: string; difficulty: string | null }>> {
  const topic = topicForConceptId(conceptId);
  if (!topic || !isDatabaseConfigured()) return [];
  try {
    const sql = requireSql();
    return (await sql`
      SELECT id, canonical_wording, difficulty
      FROM published.v_questions
      WHERE topic = ${topic}
      ORDER BY updated_at DESC NULLS LAST, id
      LIMIT ${limit}
    `) as Array<{ id: string; canonical_wording: string; difficulty: string | null }>;
  } catch (err) {
    console.warn("[concepts] linked questions failed", err);
    return [];
  }
}

export function resourcesForConcepts(): LearningResource[] {
  return [];
}

export function diagramsForConcepts(conceptIds: string[]): DiagramRef[] {
  const diagrams = loadDiagramAssetsFallback();
  return conceptIds
    .map((conceptId) => CONCEPT_DIAGRAM[conceptId])
    .filter((id): id is string => Boolean(id))
    .map((id) => diagrams.get(id)?.ref)
    .filter((ref): ref is DiagramRef => Boolean(ref));
}
