/**
 * Demo: heat + hybrid search + pseudo-RAG pack over fixtures (or repo data).
 *
 *   npm run demo -w @ibpe/search
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPseudoRagPack,
  buildTopicHeat,
  loadBankQuestions,
  loadTeachingCorpusFromSeed,
  searchCorpus,
  slugifyFirm,
  topHeatTopics,
} from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "fixtures");

function main() {
  const docs = loadTeachingCorpusFromSeed(
    path.join(fixtures, "teaching_seed.json"),
  );
  const bank = loadBankQuestions(path.join(fixtures, "bank_slice.json"));
  const firm_ids = [
    slugifyFirm("Goldman Sachs"),
    slugifyFirm("Morgan Stanley"),
  ];
  const heatResult = buildTopicHeat(bank, { firm_ids });
  const hot = topHeatTopics(heatResult.rows, firm_ids, 5);

  console.log("=== Topic heat (Glassdoor bank signals) ===");
  console.log(JSON.stringify(hot, null, 2));

  const search = searchCorpus({
    request: { q: "DCF WACC valuation", firm_ids, limit: 3 },
    documents: docs,
    heat: heatResult.rows,
    weak_topics: ["valuation", "lbo"],
  });
  console.log("\n=== Hybrid search hits ===");
  for (const h of search.hits) {
    console.log(
      `- [${h.score.toFixed(3)}] ${h.provenance} :: ${h.title.slice(0, 80)}`,
    );
  }

  const { pack, metadata } = buildPseudoRagPack({
    query: "Prepare me for GS/MS — LBO and DCF weak spots",
    firm_ids,
    documents: docs,
    heat: heatResult.rows,
    weak_topics: ["lbo", "valuation"],
    limit: 5,
  });

  console.log("\n=== Pseudo-RAG pack (frozen) ===");
  console.log(
    JSON.stringify(
      {
        query: pack.query,
        firm_ids: pack.firm_ids,
        item_ids: pack.item_ids,
        scores: pack.scores,
        citations: pack.citations,
        frozen_at: pack.frozen_at,
      },
      null,
      2,
    ),
  );
  console.log("\n=== Pack explanations (weak-topic / heat) ===");
  for (const e of metadata.explanations) {
    console.log(`* ${e.item_id} (topic=${e.topic})`);
    for (const r of e.reasons) console.log(`    - ${r}`);
  }
  console.log("\nBackend:", metadata.backend);
  console.log("Notes:", metadata.notes.join(" | "));
}

main();
