import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFacets,
  buildPseudoRagPack,
  buildTopicHeat,
  loadBankQuestions,
  loadTeachingCorpusFromSeed,
  searchCorpus,
  slugifyFirm,
  recommendForTargets,
  inferTopic,
  intensityFromCount,
} from "./index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../fixtures");

describe("topic inference + intensity", () => {
  it("maps DCF / LBO wording", () => {
    assert.equal(inferTopic("Walk me through a DCF"), "valuation");
    assert.equal(inferTopic("Basic LBO walkthrough"), "lbo");
    assert.equal(inferTopic("Tell me about yourself"), "behavioral");
  });

  it("mirrors SQL intensity curve", () => {
    assert.equal(intensityFromCount(0), 0);
    assert.ok(intensityFromCount(1) > 0);
    assert.ok(intensityFromCount(49) <= 1);
    assert.equal(intensityFromCount(49), 1);
  });
});

describe("topic heat from bank slice", () => {
  it("builds TopicHeat for selected firms", () => {
    const rows = loadBankQuestions(path.join(fixtures, "bank_slice.json"));
    const firm_ids = [
      slugifyFirm("Goldman Sachs"),
      slugifyFirm("Morgan Stanley"),
    ];
    const heat = buildTopicHeat(rows, { firm_ids });
    assert.equal(heat.backend, "in_memory_bank");
    assert.equal(heat.method, "glassdoor_occurrence");
    assert.ok(heat.rows.length > 0);
    for (const row of heat.rows) {
      assert.ok(firm_ids.includes(row.firm_id));
      assert.ok(row.intensity >= 0 && row.intensity <= 1);
      assert.equal(row.method, "glassdoor_occurrence");
    }
  });
});

describe("hybrid search + facets", () => {
  it("returns cited SearchHits for accounting query", () => {
    const docs = loadTeachingCorpusFromSeed(
      path.join(fixtures, "teaching_seed.json"),
    );
    const rows = loadBankQuestions(path.join(fixtures, "bank_slice.json"));
    const firm_ids = [slugifyFirm("Goldman Sachs")];
    const heat = buildTopicHeat(rows, { firm_ids }).rows;

    const result = searchCorpus({
      request: {
        q: "three financial statements depreciation",
        firm_ids,
        topics: [],
        limit: 5,
      },
      documents: docs,
      heat,
      weak_topics: ["accounting"],
    });

    assert.equal(result.backend, "in_memory_hybrid");
    assert.ok(result.hits.length > 0);
    assert.ok(result.hits[0]!.score > 0);
    assert.ok(result.hits[0]!.provenance);
    assert.notEqual(result.hits[0]!.provenance, "glassdoor_occurrence");

    const facets = buildFacets(docs);
    assert.ok(facets.topics.some((t) => t.value === "accounting"));
  });
});

describe("pseudo-RAG pack builder", () => {
  it("retrieve → heat/weakness → freeze with citations + explanations", () => {
    const docs = loadTeachingCorpusFromSeed(
      path.join(fixtures, "teaching_seed.json"),
    );
    const rows = loadBankQuestions(path.join(fixtures, "bank_slice.json"));
    const firm_ids = [
      slugifyFirm("Goldman Sachs"),
      slugifyFirm("JPMorgan"),
    ];
    const heat = buildTopicHeat(rows, { firm_ids }).rows;

    const { pack, metadata, hits } = buildPseudoRagPack({
      query: "LBO returns and DCF valuation for interviews",
      firm_ids,
      documents: docs,
      heat,
      weak_topics: ["lbo", "valuation"],
      limit: 5,
    });

    assert.equal(pack.firm_ids.length, 2);
    assert.equal(pack.item_ids.length, pack.citations.length);
    assert.equal(pack.item_ids.length, pack.scores.length);
    assert.ok(pack.frozen_at);
    for (const c of pack.citations) {
      assert.ok(
        ["github_source", "static_seed", "editorial", "gemini_synthesised"].includes(
          c.provenance,
        ),
      );
      assert.notEqual(c.provenance, "glassdoor_occurrence");
    }
    assert.equal(metadata.explanations.length, hits.length);
    assert.ok(
      metadata.explanations.some(
        (e) => e.weak_topic_hit || e.heat_hits.length > 0 || e.reasons.length > 0,
      ),
    );
    assert.deepEqual(metadata.weak_topics_used, ["lbo", "valuation"]);
  });
});

describe("recommendations", () => {
  it("explains heat and weakness", () => {
    const docs = loadTeachingCorpusFromSeed(
      path.join(fixtures, "teaching_seed.json"),
    );
    const rows = loadBankQuestions(path.join(fixtures, "bank_slice.json"));
    const firm_ids = [slugifyFirm("Goldman Sachs")];
    const heat = buildTopicHeat(rows, { firm_ids }).rows;
    const recs = recommendForTargets({
      documents: docs,
      heat,
      firm_ids,
      weak_topics: ["accounting"],
      query: "financial statements",
      limit: 3,
    });
    assert.ok(recs.length > 0);
    assert.ok(recs[0]!.reasons.length > 0);
  });
});
