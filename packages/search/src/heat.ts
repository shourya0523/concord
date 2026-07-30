/**
 * Firm topic heat from Glassdoor bank / occurrence exports (signals only).
 * Does not scrape live Glassdoor. Matches published.v_firm_topic_heat intensity.
 */
import { TopicHeatSchema, type TopicHeat } from "@ibpe/contracts";
import { readFileSync } from "node:fs";
import { slugifyFirm } from "./text.js";
import { inferTopic, intensityFromCount } from "./topics.js";
import type { BankOccurrenceRow, HeatQuery, HeatResult } from "./types.js";

export function loadBankQuestions(path: string): BankOccurrenceRow[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    questions?: BankOccurrenceRow[];
  };
  if (!Array.isArray(raw.questions)) {
    throw new Error(`Invalid bank file (missing questions[]): ${path}`);
  }
  return raw.questions.map((q) => ({
    id: q.id,
    company: q.company,
    track: String(q.track),
    position: q.position,
    question: q.question,
    date_posted: q.date_posted ?? null,
    scraped_at: q.scraped_at,
  }));
}

/**
 * Aggregate bank rows → TopicHeat[].
 * Each Glassdoor question is a directional occurrence; topic is inferred from wording.
 */
export function computeTopicHeatFromBank(
  rows: BankOccurrenceRow[],
  options?: { firm_ids?: string[]; window?: string },
): TopicHeat[] {
  const filter = options?.firm_ids?.length
    ? new Set(options.firm_ids)
    : null;
  const counts = new Map<string, { firm_id: string; topic_id: string; n: number }>();

  for (const row of rows) {
    const firm_id = slugifyFirm(row.company);
    if (filter && !filter.has(firm_id)) continue;
    const topic_id = inferTopic(row.question);
    const key = `${firm_id}::${topic_id}`;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { firm_id, topic_id, n: 1 });
  }

  const out: TopicHeat[] = [];
  for (const { firm_id, topic_id, n } of counts.values()) {
    out.push(
      TopicHeatSchema.parse({
        firm_id,
        topic_id,
        intensity: intensityFromCount(n),
        sample_size: n,
        window: options?.window ?? "bank_all",
        method: "glassdoor_occurrence",
      }),
    );
  }
  return out.sort(
    (a, b) => b.intensity - a.intensity || b.sample_size - a.sample_size,
  );
}

export function buildTopicHeat(
  rows: BankOccurrenceRow[],
  query: HeatQuery,
): HeatResult {
  let heat = computeTopicHeatFromBank(rows, {
    firm_ids: query.firm_ids,
    window: query.window,
  });
  if (query.topic_ids?.length) {
    const allow = new Set(query.topic_ids);
    heat = heat.filter((h) => allow.has(h.topic_id));
  }
  const by_topic: Record<string, number> = {};
  for (const h of heat) {
    by_topic[h.topic_id] = Math.max(by_topic[h.topic_id] ?? 0, h.intensity);
  }
  return {
    rows: heat,
    by_topic,
    method: "glassdoor_occurrence",
    backend: "in_memory_bank",
  };
}

/** Max heat intensity for a document topic across selected firms. */
export function heatForTopic(
  heat: TopicHeat[],
  firmIds: string[],
  topic: string | null,
): { intensity: number; hits: TopicHeat[] } {
  if (!topic || firmIds.length === 0) return { intensity: 0, hits: [] };
  const firmSet = new Set(firmIds);
  const hits = heat.filter(
    (h) => firmSet.has(h.firm_id) && h.topic_id === topic,
  );
  const intensity = hits.reduce((m, h) => Math.max(m, h.intensity), 0);
  return { intensity, hits };
}

/** Top hot topics for a firm set (for UI / pack filter). */
export function topHeatTopics(
  heat: TopicHeat[],
  firmIds: string[],
  limit = 8,
): Array<{ topic_id: string; intensity: number; sample_size: number }> {
  const firmSet = new Set(firmIds);
  const agg = new Map<string, { intensity: number; sample_size: number }>();
  for (const h of heat) {
    if (!firmSet.has(h.firm_id)) continue;
    const cur = agg.get(h.topic_id) ?? { intensity: 0, sample_size: 0 };
    cur.intensity = Math.max(cur.intensity, h.intensity);
    cur.sample_size += h.sample_size;
    agg.set(h.topic_id, cur);
  }
  return [...agg.entries()]
    .map(([topic_id, v]) => ({ topic_id, ...v }))
    .filter((t) => t.topic_id !== "untagged")
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, limit);
}
