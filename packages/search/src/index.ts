/**
 * @ibpe/search — hybrid search, firm topic heat, and real RAG packs.
 *
 * Default pack path is embedding-backed real RAG when vectors are supplied.
 * Lexical in-memory hybrid remains available as fallback.
 */
export {
  loadTeachingCorpusFromSeed,
  loadTeachingCorpusFromExports,
  mergeTeachingDocuments,
} from "./corpus.js";
export {
  loadBankQuestions,
  computeTopicHeatFromBank,
  buildTopicHeat,
  heatForTopic,
  topHeatTopics,
} from "./heat.js";
export { searchCorpus } from "./search.js";
export type { SearchCorpusInput, SearchCorpusResult } from "./search.js";
export { buildFacets, buildFacetsFromDocuments, buildFacetsFromHits } from "./facets.js";
export {
  buildPseudoRagPack,
  filterByHeatAndWeakness,
  rerankForPack,
  freezePack,
} from "./pack.js";
export { buildRealRagPack, retrieveWithEmbeddings } from "./rag.js";
export type {
  EmbeddedDocument,
  RealRagOptions,
  BuildRealRagPackInput,
} from "./rag.js";
export { recommendForTargets } from "./recommend.js";
export type { Recommendation } from "./recommend.js";
export { rankDocuments, scoreDocument } from "./rank.js";
export { inferTopic, intensityFromCount, TOPIC_RULES } from "./topics.js";
export {
  tokenize,
  trigrams,
  slugifyFirm,
  normalizeText,
  scoreTextOverlap,
  lexicalVector,
  cosineSparse,
} from "./text.js";
export type {
  TeachingDocument,
  BankOccurrenceRow,
  HeatQuery,
  HeatResult,
  ScoreBreakdown,
  RankedHit,
  SearchFacets,
  FacetBucket,
  SearchOptions,
  PackItemExplanation,
  PseudoRagPackMetadata,
  PseudoRagPackResult,
  BuildPackInput,
  SearchRequest,
  SearchResponse,
  SearchHit,
  TopicHeat,
  PseudoRagPack,
  Provenance,
} from "./types.js";
