/**
 * @ibpe/contracts — shared Zod schemas (Wave 1 expansion).
 *
 * Align with:
 * - data/question_bank.json
 * - src/ibpe_corpus/schemas/models.py
 * - config/private_equity_taxonomy.yml
 *
 * Data thesis: GitHub Q/A = teaching truth; Glassdoor = firm signals only;
 * Gemini = enrich with explicit synthesised provenance.
 */
export * from "./enums.js";
export * from "./bank.js";
export * from "./corpus.js";
export * from "./product.js";
export * from "./jobs.js";
export * from "./taxonomy.js";
