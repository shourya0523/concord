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
import {
  CURRICULUM_CONCEPTS,
  CURRICULUM_DIAGRAMS,
  CURRICULUM_MODULES,
  type CurriculumDiagram,
} from "@/lib/data/curriculum";
import { QUESTION_DIAGRAM_LINKS } from "@/lib/data/curriculum/question-diagram-links.generated";
import { linkDiagramsForQuestion } from "@/lib/data/curriculum/question-diagram-rules";
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
  version: string | number | null;
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

/** concept_id → primary diagram_id (stable DB convention). */
const CONCEPT_DIAGRAM: Record<string, string> = {
  concept_accounting_foundations: "diag_three_statement",
  concept_ev_equity_value: "diag_ev_bridge",
  concept_valuation_comps: "diag_comps_precedents",
  concept_dcf_wacc: "diag_dcf_wacc",
  concept_lbo_paper_lbo: "diag_lbo_sources_uses",
  concept_merger_model: "diag_merger_model",
  concept_pe_fund_mechanics: "diag_returns_attribution",
};

/**
 * Code-registered diagrams (no-DB fallback). Mirrors migrations 059/061 —
 * both are rendered from apps/web/lib/data/curriculum.
 */
const STUB_DIAGRAM_BODIES: Record<
  string,
  Pick<CurriculumDiagram, "title" | "body" | "format" | "version" | "a11y" | "concept_ids">
> = Object.fromEntries(
  CURRICULUM_DIAGRAMS.map((diagram) => [
    diagram.id,
    {
      title: diagram.title,
      body: diagram.body,
      format: diagram.format,
      version: diagram.version,
      a11y: diagram.a11y,
      concept_ids: diagram.concept_ids,
    },
  ]),
);

const CURRICULUM_CONCEPT_BY_ID = new Map(CURRICULUM_CONCEPTS.map((c) => [c.id, c]));

const STUB_CONCEPTS: Concept[] = CURRICULUM_CONCEPTS.map((concept) =>
  ConceptSchema.parse({
    id: concept.id,
    slug: concept.slug,
    title: concept.title,
    prerequisites: concept.prerequisites,
    firm_relevance: {},
    domain: concept.domain,
    summary: concept.summary,
  }),
);

const STUB_MODULES: LearningModule[] = [...CURRICULUM_MODULES]
  .sort((a, b) => a.order - b.order)
  .map((learningModule) =>
    LearningModuleSchema.parse({
      id: learningModule.id,
      slug: learningModule.slug,
      title: learningModule.title,
      domain: learningModule.domain,
      track: learningModule.track,
      summary: learningModule.summary,
      estimated_minutes: learningModule.estimated_minutes,
      concept_ids: [learningModule.concept_id],
      diagram_ids: [
        ...new Set(
          learningModule.checkpoints
            .map((checkpoint) => checkpoint.diagram_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
      prereq_module_ids: learningModule.prereq_module_ids,
      checkpoints: learningModule.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        kind: checkpoint.kind,
        title: checkpoint.title,
        position: checkpoint.position,
        concept_id: checkpoint.concept_id,
        diagram_id: checkpoint.diagram_id ?? null,
        question_ids: checkpoint.question_ids,
      })),
      lesson_ids: learningModule.checkpoints
        .filter((checkpoint) => checkpoint.kind === "lesson")
        .map((checkpoint) => checkpoint.id),
      publishable: true,
    }),
  );

/** checkpoint id → curriculum lesson markdown (stub + DB-null fallback). */
const STUB_CHECKPOINT_BODIES = new Map(
  CURRICULUM_MODULES.flatMap((learningModule) =>
    learningModule.checkpoints
      .filter((checkpoint) => checkpoint.body_markdown)
      .map((checkpoint) => [checkpoint.id, checkpoint.body_markdown!] as const),
  ),
);

const STUB_CHECKPOINT_METADATA = new Map(
  CURRICULUM_MODULES.flatMap((learningModule) =>
    learningModule.checkpoints.map(
      (checkpoint) => [checkpoint.id, checkpoint.metadata ?? {}] as const,
    ),
  ),
);

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

/** Numeric part of a diagram version label ('v1', '1', '2' → 1, 1, 2). */
export function diagramVersionNumber(version: string | number | null | undefined): number {
  if (typeof version === "number") return version;
  const digits = String(version ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
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
    ORDER BY
      CASE WHEN (m.metadata_json->>'order') ~ '^[0-9]+$'
        THEN (m.metadata_json->>'order')::int END ASC NULLS LAST,
      m.title ASC
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
      note: "DATABASE_URL unset — built-in curriculum.",
    };
  }

  try {
    const items = await loadModulesFromDb();
    if (!items) {
      return {
        items: listStubLearningModules(),
        source: "stub",
        note: "No publishable modules in DB — built-in curriculum fallback.",
      };
    }
    return { items, source: "published" };
  } catch (err) {
    console.warn("[learn] DB module list failed; using stubs", err);
    return {
      items: listStubLearningModules(),
      source: "stub",
      note: "DB module read failed — built-in curriculum fallback.",
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
      note: "DATABASE_URL unset — built-in curriculum module.",
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
    note: "Module not in DB — built-in curriculum fallback.",
  };
}

export type CheckpointContent = {
  /** Lesson / concept-lab markdown (may be null for drills). */
  body_markdown: string | null;
  /** checkpoint metadata_json, e.g. {"mode":"quiz"} for diagram quizzes. */
  metadata: Record<string, unknown>;
};

/**
 * Lesson bodies + metadata for a module's checkpoints (checkpoint id → content).
 * DB first (published view); curriculum source fills anything missing so
 * no-DB mode and a DB without migration 060 still show real lessons.
 */
export async function getModuleCheckpointContent(
  moduleId: string,
): Promise<Map<string, CheckpointContent>> {
  const map = new Map<string, CheckpointContent>();
  const learningModule = CURRICULUM_MODULES.find((item) => item.id === moduleId);
  for (const checkpoint of learningModule?.checkpoints ?? []) {
    map.set(checkpoint.id, {
      body_markdown: STUB_CHECKPOINT_BODIES.get(checkpoint.id) ?? null,
      metadata: STUB_CHECKPOINT_METADATA.get(checkpoint.id) ?? {},
    });
  }
  if (!isDatabaseConfigured()) return map;
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT id, body_markdown, metadata_json
      FROM published.v_learning_module_checkpoints
      WHERE module_id = ${moduleId}
    `) as Array<{
      id: string;
      body_markdown: string | null;
      metadata_json: Record<string, unknown> | null;
    }>;
    for (const row of rows) {
      const fallback = map.get(row.id);
      map.set(row.id, {
        body_markdown: row.body_markdown?.trim()
          ? row.body_markdown
          : (fallback?.body_markdown ?? null),
        metadata: { ...(fallback?.metadata ?? {}), ...(row.metadata_json ?? {}) },
      });
    }
  } catch (err) {
    console.warn("[learn] checkpoint content load failed; using curriculum source", err);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Concepts, diagrams, resources (DB-backed)
// ---------------------------------------------------------------------------

function rowToConcept(row: ConceptRow): Concept {
  const curriculum = CURRICULUM_CONCEPT_BY_ID.get(row.id);
  return ConceptSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    prerequisites: curriculum?.prerequisites ?? [],
    firm_relevance: {},
    domain:
      curriculum?.domain ??
      (row.track?.toLowerCase() === "ib" || row.track?.toLowerCase() === "pe"
        ? row.track.toLowerCase()
        : "both"),
    summary: row.summary ?? undefined,
  });
}

function stubAsset(id: string): DiagramAsset | null {
  const stub = STUB_DIAGRAM_BODIES[id];
  if (!stub) return null;
  return {
    ref: DiagramRefSchema.parse({
      id,
      type: stub.title,
      format: stub.format,
      version: stub.version,
      a11y_fallback: stub.a11y,
      concept_ids: stub.concept_ids,
    }),
    title: stub.title,
    body: stub.body,
  };
}

function loadDiagramAssetsFallback(): Map<string, DiagramAsset> {
  const map = new Map<string, DiagramAsset>();
  for (const id of Object.keys(STUB_DIAGRAM_BODIES)) {
    const asset = stubAsset(id);
    if (asset) map.set(id, asset);
  }
  return map;
}

/** Latest version per diagram: DB rows over the code-registered curriculum. */
async function loadDiagramAssets(): Promise<Map<string, DiagramAsset>> {
  const map = loadDiagramAssetsFallback();
  if (!isDatabaseConfigured()) return map;
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
        ORDER BY
          coalesce(nullif(regexp_replace(v.version, '[^0-9]', '', 'g'), ''), '0')::int DESC,
          v.created_at DESC
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
          concept_ids: STUB_DIAGRAM_BODIES[row.id]?.concept_ids ?? [],
        }),
        title: row.title,
        body: row.body,
      });
    }
  } catch (err) {
    console.warn("[learn] diagram load failed; using code-registered diagrams", err);
  }
  return map;
}

/** Resolved diagram assets for the given ids (missing ids are skipped). */
export async function getDiagramAssetsByIds(
  ids: string[],
): Promise<Map<string, DiagramAsset>> {
  const wanted = new Set(ids);
  const result = new Map<string, DiagramAsset>();
  if (wanted.size === 0) return result;
  const assets = await loadDiagramAssets();
  for (const id of wanted) {
    const asset = assets.get(id);
    if (asset) result.set(id, asset);
  }
  return result;
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
    for (const conceptId of CURRICULUM_CONCEPTS.map((c) => c.id)) {
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

/** Primary diagram first, then other mermaid diagrams tagged with the concept. */
function diagramIdsForConcept(conceptId: string): string[] {
  const primary = CONCEPT_DIAGRAM[conceptId];
  const tagged = CURRICULUM_DIAGRAMS.filter(
    (diagram) => diagram.format === "mermaid" && diagram.concept_ids.includes(conceptId),
  ).map((diagram) => diagram.id);
  return [...new Set([...(primary ? [primary] : []), ...tagged])];
}

function conceptWithAssets(options: {
  concept: Concept;
  diagrams: Map<string, DiagramAsset>;
  resources: Map<string, LearningResource[]>;
  firmRelevance: Map<string, Record<string, number>>;
}): ConceptWithAssets {
  const { concept, diagrams, resources, firmRelevance } = options;
  const assets = diagramIdsForConcept(concept.id)
    .map((id) => diagrams.get(id))
    .filter((asset): asset is DiagramAsset => Boolean(asset));
  const topic = topicForConceptId(concept.id);
  const enriched = ConceptSchema.parse({
    ...concept,
    firm_relevance: firmRelevance.get(concept.id) ?? concept.firm_relevance,
  });
  return {
    concept: enriched,
    topic,
    diagram_refs: assets.map((asset) => asset.ref),
    diagrams: assets,
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

export type QuestionDiagram = DiagramAsset & {
  relevance: number;
  /** Where the link came from: canonical.question_diagrams or a fallback. */
  link_source: "published" | "generated" | "rules";
};

/**
 * Diagrams linked to a canonical question, most relevant first (P2.9).
 *
 * 1. canonical.question_diagrams (migration 059/061)
 * 2. the generated export link map (same rules, works without a DB)
 * 3. keyword / topic rules on `wording` + `topic` (passed by the caller or
 *    read from published.v_questions)
 */
export async function listDiagramsForQuestion(
  questionId: string,
  options: { topic?: string | null; wording?: string | null; limit?: number } = {},
): Promise<QuestionDiagram[]> {
  const limit = options.limit ?? 3;
  let links: Array<{ diagram_id: string; relevance: number }> = [];
  let linkSource: QuestionDiagram["link_source"] = "generated";
  let topic = options.topic ?? null;
  let wording = options.wording ?? null;

  if (isDatabaseConfigured()) {
    try {
      const sql = requireSql();
      const rows = (await sql`
        SELECT diagram_id, relevance
        FROM canonical.question_diagrams
        WHERE question_id = ${questionId}
        ORDER BY relevance DESC, diagram_id ASC
        LIMIT ${limit}
      `) as Array<{ diagram_id: string; relevance: number }>;
      links = rows.map((row) => ({
        diagram_id: row.diagram_id,
        relevance: Number(row.relevance),
      }));
      linkSource = "published";
      if (links.length === 0 && (!topic || !wording)) {
        const questionRows = (await sql`
          SELECT topic, canonical_wording
          FROM published.v_questions
          WHERE id = ${questionId}
          LIMIT 1
        `) as Array<{ topic: string | null; canonical_wording: string | null }>;
        topic = topic ?? questionRows[0]?.topic ?? null;
        wording = wording ?? questionRows[0]?.canonical_wording ?? null;
      }
    } catch (err) {
      console.warn("[learn] question diagram links failed; using fallback", err);
    }
  }

  if (links.length === 0) {
    const generated = QUESTION_DIAGRAM_LINKS[questionId];
    if (generated?.length) {
      links = generated.map(([diagram_id, relevance]) => ({ diagram_id, relevance }));
      linkSource = "generated";
    } else {
      links = linkDiagramsForQuestion({ wording, topic });
      linkSource = "rules";
    }
  }
  if (links.length === 0) return [];

  const assets = await getDiagramAssetsByIds(links.map((link) => link.diagram_id));
  return links
    .slice(0, limit)
    .map((link) => {
      const asset = assets.get(link.diagram_id);
      return asset
        ? { ...asset, relevance: link.relevance, link_source: linkSource }
        : null;
    })
    .filter((item): item is QuestionDiagram => Boolean(item));
}

export type QuestionSummary = {
  id: string;
  canonical_wording: string;
  difficulty: string | null;
};

let exportQuestionCache: Map<string, QuestionSummary> | null = null;

/** exports/questions.jsonl (teaching corpus export) — no-DB wording lookup. */
async function loadExportQuestions(): Promise<Map<string, QuestionSummary>> {
  if (exportQuestionCache) return exportQuestionCache;
  const map = new Map<string, QuestionSummary>();
  try {
    const [{ readFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const file =
      process.env.QUESTION_EXPORT_PATH?.trim() ||
      path.resolve(process.cwd(), "../../exports/questions.jsonl");
    const text = await readFile(file, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as Partial<QuestionSummary>;
      if (typeof row.id === "string" && typeof row.canonical_wording === "string") {
        map.set(row.id, {
          id: row.id,
          canonical_wording: row.canonical_wording,
          difficulty: typeof row.difficulty === "string" ? row.difficulty : null,
        });
      }
    }
  } catch (err) {
    console.warn("[learn] exports/questions.jsonl unavailable", err);
  }
  exportQuestionCache = map;
  return map;
}

/**
 * Wording for checkpoint question ids, in the order given. Published view
 * first; the teaching export fills gaps (and serves no-DB mode).
 */
export async function getQuestionSummaries(ids: string[]): Promise<QuestionSummary[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = new Map<string, QuestionSummary>();
  if (isDatabaseConfigured()) {
    try {
      const sql = requireSql();
      const rows = (await sql`
        SELECT id, canonical_wording, difficulty
        FROM published.v_questions
        WHERE id = ANY(${unique}::text[])
      `) as QuestionSummary[];
      for (const row of rows) found.set(row.id, row);
    } catch (err) {
      console.warn("[learn] question summaries failed; using export", err);
    }
  }
  if (found.size < unique.length) {
    const exported = await loadExportQuestions();
    for (const id of unique) {
      if (!found.has(id) && exported.has(id)) found.set(id, exported.get(id)!);
    }
  }
  return unique
    .map((id) => found.get(id))
    .filter((row): row is QuestionSummary => Boolean(row));
}

/** Question ids the curriculum attaches to a concept's checkpoints (in order). */
export function curriculumQuestionIdsForConcept(conceptId: string, limit = 6): string[] {
  const ids: string[] = [];
  for (const learningModule of CURRICULUM_MODULES) {
    for (const checkpoint of learningModule.checkpoints) {
      if (checkpoint.concept_id !== conceptId) continue;
      for (const id of checkpoint.question_ids) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
  }
  return ids.slice(0, limit);
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
