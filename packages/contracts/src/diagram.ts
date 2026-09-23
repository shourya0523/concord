/**
 * Interactive diagram contract (plan 2026-09-23-001 P7.2).
 *
 * `canonical.diagram_versions.format = 'interactive-json'` bodies are JSON
 * documents matching `InteractiveDiagramSchema`: positioned nodes, directed
 * edges, and optional fill-in blanks. They are rendered by the
 * `DiagramFillBlank` component (packages/ui) — never passed to Mermaid.
 */
import { z } from "zod";

export const DiagramFormatEnum = z.enum(["mermaid", "interactive-json"]);
export type DiagramFormat = z.infer<typeof DiagramFormatEnum>;

export const InteractiveDiagramBlankSchema = z
  .object({
    /** The correct option (must be one of `options`). */
    answer: z.string().min(1),
    /** Choices shown to the learner (2–6, includes the answer). */
    options: z.array(z.string().min(1)).min(2).max(6),
    /** Optional one-line explanation shown after checking. */
    explain: z.string().optional(),
  })
  .refine((blank) => blank.options.includes(blank.answer), {
    message: "blank.answer must be one of blank.options",
  })
  .refine((blank) => new Set(blank.options).size === blank.options.length, {
    message: "blank.options must be unique",
  });
export type InteractiveDiagramBlank = z.infer<typeof InteractiveDiagramBlankSchema>;

export const InteractiveDiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Node centre in abstract canvas units (renderer computes the viewBox). */
  x: z.number().finite(),
  y: z.number().finite(),
  blank: InteractiveDiagramBlankSchema.optional(),
});
export type InteractiveDiagramNode = z.infer<typeof InteractiveDiagramNodeSchema>;

export const InteractiveDiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
});
export type InteractiveDiagramEdge = z.infer<typeof InteractiveDiagramEdgeSchema>;

export const InteractiveDiagramSchema = z
  .object({
    /** Question shown above the diagram. */
    prompt: z.string().min(1),
    nodes: z.array(InteractiveDiagramNodeSchema).min(2).max(24),
    edges: z.array(InteractiveDiagramEdgeSchema).default([]),
  })
  .superRefine((diagram, ctx) => {
    const ids = new Set<string>();
    for (const node of diagram.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate node id ${node.id}`,
          path: ["nodes"],
        });
      }
      ids.add(node.id);
    }
    diagram.edges.forEach((edge, index) => {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge ${edge.from}→${edge.to} references an unknown node`,
          path: ["edges", index],
        });
      }
    });
    if (!diagram.nodes.some((node) => node.blank)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interactive diagram needs at least one blank",
        path: ["nodes"],
      });
    }
  });
export type InteractiveDiagram = z.infer<typeof InteractiveDiagramSchema>;

/** Parse an `interactive-json` body; returns null when it is not valid. */
export function parseInteractiveDiagram(body: string): InteractiveDiagram | null {
  try {
    const parsed = InteractiveDiagramSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Normalise an answer for comparison (case, whitespace, unicode minus). */
export function normaliseBlankAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type InteractiveDiagramGrade = {
  total: number;
  correct: number;
  /** node id → whether the learner's answer matched. Missing = unanswered. */
  results: Record<string, boolean>;
  score: number;
};

/** Grade learner answers (node id → chosen option) against the blanks. */
export function gradeInteractiveDiagram(
  diagram: InteractiveDiagram,
  answers: Record<string, string | undefined>,
): InteractiveDiagramGrade {
  const results: Record<string, boolean> = {};
  let total = 0;
  let correct = 0;
  for (const node of diagram.nodes) {
    if (!node.blank) continue;
    total += 1;
    const given = answers[node.id];
    const ok =
      typeof given === "string" &&
      normaliseBlankAnswer(given) === normaliseBlankAnswer(node.blank.answer);
    results[node.id] = ok;
    if (ok) correct += 1;
  }
  return { total, correct, results, score: total === 0 ? 0 : correct / total };
}
