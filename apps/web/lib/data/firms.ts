/**
 * Firm topic heat — reads published.v_firm_topic_heat when DB is up; else stub.
 */
import { TopicHeatSchema, type TopicHeat } from "@ibpe/contracts";
import { isDatabaseConfigured, requireSql } from "@/lib/db/client";
import type { FirmHeatResponse } from "@/lib/api/schemas";

type HeatRow = {
  firm_id: string;
  topic_id: string;
  sample_size: number;
  intensity: number;
  method: string;
};

export async function getFirmTopicHeat(firmId: string): Promise<FirmHeatResponse> {
  if (!isDatabaseConfigured()) {
    return {
      firm_id: firmId,
      topics: [],
      source: "stub",
      note: "Topic heat is unavailable until the database is connected.",
    };
  }

  const sql = requireSql();
  const rows = (await sql`
    SELECT firm_id, topic_id, sample_size, intensity, method
    FROM published.v_firm_topic_heat
    WHERE firm_id = ${firmId} OR firm_slug = ${firmId}
    ORDER BY intensity DESC, sample_size DESC
    LIMIT 100
  `) as HeatRow[];

  const topics: TopicHeat[] = rows.map((r) =>
    TopicHeatSchema.parse({
      firm_id: r.firm_id,
      topic_id: r.topic_id,
      intensity: Number(r.intensity),
      sample_size: Number(r.sample_size),
      method: r.method === "glassdoor_occurrence" ? "glassdoor_occurrence" : "glassdoor_occurrence",
    }),
  );

  return {
    firm_id: firmId,
    topics,
    source: topics.length ? "published" : "empty",
    note: topics.length ? undefined : "No topic heat for this firm yet.",
  };
}
