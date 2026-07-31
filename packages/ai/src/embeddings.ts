/**
 * Embedding + RAG helpers (AI SDK + Gemini).
 * Prefer GOOGLE_GENERATIVE_AI_API_KEY; falls back to GEMINI_API_KEY.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cosineSimilarity, embed, embedMany } from "ai";

export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
export const DEFAULT_EMBEDDING_DIMS = 768;
/** Newest flash for grounded generation (refresh via gateway models list when bumping). */
export const DEFAULT_RAG_GENERATE_MODEL = "gemini-2.5-flash";

export function googleApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

export function isEmbeddingConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(googleApiKey(env));
}

function googleProvider(apiKey?: string) {
  const key = apiKey ?? googleApiKey();
  if (!key) {
    throw new Error(
      "Set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY for embeddings",
    );
  }
  return createGoogleGenerativeAI({ apiKey: key });
}

export function embeddingModel(apiKey?: string) {
  return googleProvider(apiKey).textEmbedding(DEFAULT_EMBEDDING_MODEL);
}

export async function embedText(
  value: string,
  opts?: { apiKey?: string; dimensions?: number },
): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(opts?.apiKey),
    value,
    providerOptions: {
      google: {
        outputDimensionality: opts?.dimensions ?? DEFAULT_EMBEDDING_DIMS,
      },
    },
  });
  return embedding;
}

export async function embedTexts(
  values: string[],
  opts?: { apiKey?: string; dimensions?: number },
): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingModel(opts?.apiKey),
    values,
    providerOptions: {
      google: {
        outputDimensionality: opts?.dimensions ?? DEFAULT_EMBEDDING_DIMS,
      },
    },
  });
  return embeddings;
}

export { cosineSimilarity };

/** Format a float vector for Neon `vector` column literal. */
export function toPgVectorLiteral(values: number[]): string {
  return `[${values.map((v) => Number(v).toFixed(8)).join(",")}]`;
}
